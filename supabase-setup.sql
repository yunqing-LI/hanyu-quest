-- ═══════════════════════════════════════════════════════════════════════════
-- «Ханьюй-квест» 数据库初始化脚本（静态版 / Supabase Postgres）
-- 使用方法：Supabase 后台 → 左侧菜单 SQL Editor → 新建查询 →
--           把本文件全部内容粘贴进去 → 点 Run（只需执行一次）
-- 说明：建表 + 索引 + 行级安全(RLS) + 开发者邮箱 + 初始 300 词词库
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 开发者邮箱名单（只有这些邮箱可以导入词表/上传录音/删词） ────────────────
-- 注意：教师邮箱不写进本文件（仓库公开，保护隐私）。
-- 首次/新增教师在 Supabase 后台 Table Editor 打开 developer_emails 表手动加一行，
-- 或 SQL Editor 执行：
--   insert into public.developer_emails (email) values ('teacher@example.com')
--   on conflict (email) do nothing;
create table if not exists public.developer_emails (
  email text primary key
);

alter table public.developer_emails enable row level security;

-- 判断当前登录用户是否在开发者名单中（数据库内部使用）
create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.developer_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_developer() from anon;
grant execute on function public.is_developer() to authenticated;

-- ─── 词表（所有登录学生只读；仅开发者可写） ──────────────────────────────────
create table if not exists public.words (
  id           bigint generated always as identity primary key,
  hanzi        text not null,
  pinyin       text not null,
  russian      text not null,
  is_concrete  boolean not null default false,  -- 直观词（才配图、才出图片题）
  has_image    boolean not null default false,
  image_path   text,
  has_audio    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_words_hanzi on public.words (hanzi);

-- 去重约束：同一个「汉字+释义」只出现一次（与导入逻辑的去重键一致，也让初始词库可重复执行）
create unique index if not exists uq_words_hanzi_russian on public.words (hanzi, russian);

-- ─── 单词录音（mp3 的 base64，直接存数据库） ────────────────────────────────
create table if not exists public.word_audio (
  word_id       bigint primary key references public.words (id) on delete cascade,
  audio_base64  text not null,
  mime          text not null default 'audio/mpeg',
  updated_at    timestamptz not null default now()
);

-- ─── 每用户每词掌握进度（间隔重复；仅本人可见） ─────────────────────────────
create table if not exists public.user_word_progress (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_id        bigint not null references public.words (id) on delete cascade,
  level          int not null default 0 check (level between 0 and 5),
  next_due_date  date not null,
  correct_count  int not null default 0,
  wrong_count    int not null default 0,
  last_result    text,
  updated_at     timestamptz not null default now(),
  unique (user_id, word_id)
);

create index if not exists idx_progress_due on public.user_word_progress (user_id, next_due_date);

-- ─── 练习场次（一天可多场） ─────────────────────────────────────────────────
create table if not exists public.exercise_sessions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  total         int not null default 0,
  correct       int not null default 0,
  duration_sec  int not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_sessions_user_date on public.exercise_sessions (user_id, date);

-- ─── 练习明细（每题一行） ───────────────────────────────────────────────────
create table if not exists public.exercise_items (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id     bigint not null references public.exercise_sessions (id) on delete cascade,
  word_id        bigint not null references public.words (id) on delete cascade,
  exercise_type  text not null,
  result         text not null,  -- correct / wrong / known / unknown
  created_at     timestamptz not null default now()
);

create index if not exists idx_items_session on public.exercise_items (session_id);
create index if not exists idx_items_user on public.exercise_items (user_id);

-- ─── 打卡（一天一条） ───────────────────────────────────────────────────────
create table if not exists public.checkins (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

-- ─── 徽章 ───────────────────────────────────────────────────────────────────
create table if not exists public.badges (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  badge_code  text not null,
  earned_at   timestamptz not null default now(),
  unique (user_id, badge_code)
);

-- ═══ 行级安全（RLS）：强制开启，用户数据互不可见 ═══════════════════════════════

alter table public.words enable row level security;
alter table public.word_audio enable row level security;
alter table public.user_word_progress enable row level security;
alter table public.exercise_sessions enable row level security;
alter table public.exercise_items enable row level security;
alter table public.checkins enable row level security;
alter table public.badges enable row level security;

-- 词表与录音：所有登录用户可读；仅开发者邮箱可写
create policy "words readable by students"
  on public.words for select to authenticated using (true);
create policy "words writable by developer"
  on public.words for insert to authenticated with check (public.is_developer());
create policy "words updatable by developer"
  on public.words for update to authenticated using (public.is_developer()) with check (public.is_developer());
create policy "words deletable by developer"
  on public.words for delete to authenticated using (public.is_developer());

create policy "audio readable by students"
  on public.word_audio for select to authenticated using (true);
create policy "audio writable by developer"
  on public.word_audio for insert to authenticated with check (public.is_developer());
create policy "audio updatable by developer"
  on public.word_audio for update to authenticated using (public.is_developer()) with check (public.is_developer());
create policy "audio deletable by developer"
  on public.word_audio for delete to authenticated using (public.is_developer());

-- 用户数据：本人全权读写；开发者额外可读可删（教师后台统计/删词需要）
create policy "progress own all"
  on public.user_word_progress for all to authenticated
  using (user_id = auth.uid() or public.is_developer())
  with check (user_id = auth.uid() or public.is_developer());

create policy "sessions own all"
  on public.exercise_sessions for all to authenticated
  using (user_id = auth.uid() or public.is_developer())
  with check (user_id = auth.uid() or public.is_developer());

create policy "items own all"
  on public.exercise_items for all to authenticated
  using (user_id = auth.uid() or public.is_developer())
  with check (user_id = auth.uid() or public.is_developer());

create policy "checkins own all"
  on public.checkins for all to authenticated
  using (user_id = auth.uid() or public.is_developer())
  with check (user_id = auth.uid() or public.is_developer());

create policy "badges own all"
  on public.badges for all to authenticated
  using (user_id = auth.uid() or public.is_developer())
  with check (user_id = auth.uid() or public.is_developer());

-- ═══ 初始词库：HSK1+2 共 300 词 ═══════════════════════════════════════════════
-- （下面由脚本从 db/data/words-export.json 生成；可重复执行，重复的词自动跳过）

insert into public.words (hanzi, pinyin, russian, is_concrete, has_image, image_path, has_audio)
values
('爱','ài','любить',false,false,NULL,false),
('飞机','fēijī','самолёт',true,false,NULL,false),
('里','lǐ','в, внутри (послелог)',false,false,NULL,false),
('八','bā','восемь',false,false,NULL,false),
('分钟','fēnzhōng','минута',false,false,NULL,false),
('六','liù','шесть',false,false,NULL,false),
('爸爸','bàba','папа',true,false,NULL,false),
('高兴','gāoxìng','радостный, довольный',false,false,NULL,false),
('妈妈','māma','мама',true,false,NULL,false),
('杯子','bēizi','стакан, чашка',true,false,NULL,false),
('个','gè','(универсальное счётное слово)',false,false,NULL,false),
('吗','ma','(вопросительная частица)',false,false,NULL,false),
('北京','Běijīng','Пекин',true,false,NULL,false),
('工作','gōngzuò','работать; работа',true,false,NULL,false),
('买','mǎi','покупать',true,false,NULL,false),
('本','běn','(счётное слово для книг)',false,false,NULL,false),
('狗','gǒu','собака',true,false,NULL,false),
('猫','māo','кошка',true,false,NULL,false),
('不','bù','не, нет',false,false,NULL,false),
('汉语','Hànyǔ','китайский язык',false,false,NULL,false),
('没关系','méi guānxi','ничего страшного, не за что',false,false,NULL,false),
('不客气','bú kèqi','не стоит благодарности, не за что',false,false,NULL,false),
('好','hǎo','хороший, хорошо',false,false,NULL,false),
('没有','méiyǒu','не иметь, нет; не (о прошедшем)',false,false,NULL,false),
('菜','cài','блюдо; овощи',true,false,NULL,false),
('号','hào','число (даты), номер',false,false,NULL,false),
('米饭','mǐfàn','варёный рис',true,false,NULL,false),
('茶','chá','чай',true,false,NULL,false),
('喝','hē','пить',true,false,NULL,false),
('名字','míngzi','имя',false,false,NULL,false),
('吃','chī','есть, кушать',true,false,NULL,false),
('和','hé','и, с',false,false,NULL,false),
('明天','míngtiān','завтра',false,false,NULL,false),
('出租车','chūzūchē','такси',true,false,NULL,false),
('很','hěn','очень',false,false,NULL,false),
('哪','nǎ','какой, который',false,false,NULL,false),
('打电话','dǎ diànhuà','звонить по телефону',true,false,NULL,false),
('后面','hòumiàn','сзади, позади',false,false,NULL,false),
('哪儿','nǎr','где, куда',false,false,NULL,false),
('大','dà','большой',false,false,NULL,false),
('回','huí','возвращаться',false,false,NULL,false),
('那','nà','тот, то',false,false,NULL,false),
('的','de','(структурная частица)',false,false,NULL,false),
('会','huì','уметь, мочь; будет',false,false,NULL,false),
('呢','ne','(частица: а...?; продолжение действия)',false,false,NULL,false),
('点','diǎn','точка; час (времени); немного',false,false,NULL,false),
('几','jǐ','сколько (до 10); несколько',false,false,NULL,false),
('能','néng','мочь, можно',false,false,NULL,false),
('电脑','diànnǎo','компьютер',true,false,NULL,false),
('家','jiā','дом, семья',true,false,NULL,false),
('你','nǐ','ты, вы',false,false,NULL,false),
('电视','diànshì','телевизор; телевидение',true,false,NULL,false),
('叫','jiào','звать, называться',false,false,NULL,false),
('年','nián','год',false,false,NULL,false),
('电影','diànyǐng','фильм, кино',true,false,NULL,false),
('今天','jīntiān','сегодня',false,false,NULL,false),
('女儿','nǚ''ér','дочь',true,false,NULL,false),
('东西','dōngxi','вещь, предмет',false,false,NULL,false),
('九','jiǔ','девять',false,false,NULL,false),
('朋友','péngyou','друг, друзья',true,false,NULL,false),
('都','dōu','все, оба',false,false,NULL,false),
('开','kāi','открывать(ся); вести (машину)',false,false,NULL,false),
('漂亮','piàoliang','красивый',false,false,NULL,false),
('读','dú','читать (вслух); учиться',true,false,NULL,false),
('看','kàn','смотреть, читать',false,false,NULL,false),
('苹果','píngguǒ','яблоко',true,false,NULL,false),
('对不起','duìbuqǐ','извините, простите',false,false,NULL,false),
('看见','kànjiàn','увидеть, видеть',false,false,NULL,false),
('七','qī','семь',false,false,NULL,false),
('多','duō','много; насколько',false,false,NULL,false),
('块','kuài','юань; кусок',false,false,NULL,false),
('前面','qiánmiàn','спереди, впереди',false,false,NULL,false),
('多少','duōshao','сколько',false,false,NULL,false),
('来','lái','приходить, приезжать',false,false,NULL,false),
('钱','qián','деньги',true,false,NULL,false),
('儿子','érzi','сын',true,false,NULL,false),
('老师','lǎoshī','учитель, преподаватель',true,false,NULL,false),
('请','qǐng','просить; приглашать; пожалуйста',false,false,NULL,false),
('二','èr','два',false,false,NULL,false),
('了','le','(видовая/модальная частица)',false,false,NULL,false),
('去','qù','идти, ехать (туда)',false,false,NULL,false),
('饭店','fàndiàn','ресторан; отель',true,false,NULL,false),
('冷','lěng','холодный',true,false,NULL,false),
('热','rè','горячий, жаркий',true,false,NULL,false),
('人','rén','человек, люди',true,false,NULL,false),
('天气','tiānqì','погода',true,false,NULL,false),
('学校','xuéxiào','школа',true,false,NULL,false),
('认识','rènshi','знать, быть знакомым; познакомиться',false,false,NULL,false),
('听','tīng','слушать',true,false,NULL,false),
('一','yī','один',false,false,NULL,false),
('三','sān','три',false,false,NULL,false),
('同学','tóngxué','одноклассник, однокурсник',true,false,NULL,false),
('一点儿','yìdiǎnr','немного, чуть-чуть',false,false,NULL,false),
('商店','shāngdiàn','магазин',true,false,NULL,false),
('喂','wèi','алло; эй',false,false,NULL,false),
('衣服','yīfu','одежда',true,false,NULL,false),
('上','shàng','наверху; подниматься; идти (на...)',false,false,NULL,false),
('我','wǒ','я',false,false,NULL,false),
('医生','yīshēng','врач',true,false,NULL,false),
('上午','shàngwǔ','утро (до полудня)',false,false,NULL,false),
('我们','wǒmen','мы',false,false,NULL,false),
('医院','yīyuàn','больница',true,false,NULL,false),
('少','shǎo','мало, немного',false,false,NULL,false),
('五','wǔ','пять',false,false,NULL,false),
('椅子','yǐzi','стул',true,false,NULL,false),
('谁','shéi','кто (также читается shuí)',false,false,NULL,false),
('喜欢','xǐhuan','нравиться, любить',false,false,NULL,false),
('有','yǒu','иметь, быть (есть)',false,false,NULL,false),
('什么','shénme','что, какой',false,false,NULL,false),
('下','xià','внизу; спускаться; (о дожде) идти',false,false,NULL,false),
('月','yuè','месяц; луна',true,false,NULL,false),
('十','shí','десять',false,false,NULL,false),
('下午','xiàwǔ','время после полудня',false,false,NULL,false),
('再见','zàijiàn','до свидания',false,false,NULL,false),
('时候','shíhou','время, момент',false,false,NULL,false),
('下雨','xià yǔ','идёт дождь',true,false,NULL,false),
('在','zài','находиться; в, на',false,false,NULL,false),
('是','shì','быть, являться (глагол-связка)',false,false,NULL,false),
('先生','xiānsheng','господин, мистер; муж',true,false,NULL,false),
('怎么','zěnme','как, каким образом',false,false,NULL,false),
('书','shū','книга',true,false,NULL,false),
('现在','xiànzài','сейчас, теперь',false,false,NULL,false),
('怎么样','zěnmeyàng','как, каково',false,false,NULL,false),
('水','shuǐ','вода',true,false,NULL,false),
('想','xiǎng','думать; хотеть; скучать',false,false,NULL,false),
('这','zhè','это, этот',false,false,NULL,false),
('水果','shuǐguǒ','фрукты',true,false,NULL,false),
('小','xiǎo','маленький',false,false,NULL,false),
('中国','Zhōngguó','Китай',true,false,NULL,false),
('睡觉','shuìjiào','спать, ложиться спать',true,false,NULL,false),
('小姐','xiǎojiě','барышня, мисс',false,false,NULL,false),
('中午','zhōngwǔ','полдень',false,false,NULL,false),
('说','shuō','говорить, сказать',true,false,NULL,false),
('些','xiē','несколько, некоторые',false,false,NULL,false),
('住','zhù','жить, проживать; останавливаться',false,false,NULL,false),
('四','sì','четыре',false,false,NULL,false),
('写','xiě','писать (иероглифы)',true,false,NULL,false),
('桌子','zhuōzi','стол',true,false,NULL,false),
('岁','suì','год, лет (о возрасте)',false,false,NULL,false),
('谢谢','xièxie','спасибо',false,false,NULL,false),
('字','zì','иероглиф',true,false,NULL,false),
('他','tā','он',false,false,NULL,false),
('星期','xīngqī','неделя',false,false,NULL,false),
('昨天','zuótiān','вчера',false,false,NULL,false),
('她','tā','она',false,false,NULL,false),
('学生','xuésheng','ученик, студент',true,false,NULL,false),
('坐','zuò','сидеть; садиться; ехать (на транспорте)',true,false,NULL,false),
('太','tài','слишком',false,false,NULL,false),
('学习','xuéxí','учиться, изучать; учёба',true,false,NULL,false),
('做','zuò','делать, заниматься',false,false,NULL,false),
('吧','ba','(модальная частица: предположение, совет)',false,false,NULL,false),
('高','gāo','высокий',true,false,NULL,false),
('可以','kěyǐ','можно, мочь',false,false,NULL,false),
('白','bái','белый',true,false,NULL,false),
('告诉','gàosu','сказать, сообщить, рассказать',false,false,NULL,false),
('课','kè','урок, занятие; курс',false,false,NULL,false),
('百','bǎi','сто',false,false,NULL,false),
('哥哥','gēge','старший брат',true,false,NULL,false),
('快','kuài','быстрый, быстро; скоро',true,false,NULL,false),
('帮助','bāngzhù','помогать; помощь',true,false,NULL,false),
('给','gěi','давать; для, (к)ому',true,false,NULL,false),
('快乐','kuàilè','счастливый, радостный',false,false,NULL,false),
('报纸','bàozhǐ','газета',true,false,NULL,false),
('公共汽车','gōnggòng qìchē','автобус',true,false,NULL,false),
('累','lèi','уставший',true,false,NULL,false),
('比','bǐ','чем (при сравнении); сравнивать',false,false,NULL,false),
('公司','gōngsī','компания, фирма',true,false,NULL,false),
('离','lí','от, на расстоянии от',false,false,NULL,false),
('别','bié','не надо, не (запрет)',false,false,NULL,false),
('贵','guì','дорогой',false,false,NULL,false),
('两','liǎng','два, пара, оба',false,false,NULL,false),
('宾馆','bīnguǎn','гостиница',true,false,NULL,false),
('过','guo','(видовая частица опыта)',false,false,NULL,false),
('零','líng','ноль',false,false,NULL,false),
('长','cháng','длинный',true,false,NULL,false),
('还','hái','ещё, тоже, всё ещё',false,false,NULL,false),
('路','lù','дорога, путь',true,false,NULL,false),
('唱歌','chàng gē','петь (песни)',true,false,NULL,false),
('孩子','háizi','ребёнок, дети',true,false,NULL,false),
('旅游','lǚyóu','путешествовать; туризм',true,false,NULL,false),
('出','chū','выходить',false,false,NULL,false),
('好吃','hǎochī','вкусный',true,false,NULL,false),
('卖','mài','продавать',true,false,NULL,false),
('穿','chuān','надевать, носить (одежду)',true,false,NULL,false),
('黑','hēi','чёрный',true,false,NULL,false),
('慢','màn','медленный',true,false,NULL,false),
('次','cì','раз',false,false,NULL,false),
('红','hóng','красный',true,false,NULL,false),
('忙','máng','занятой, хлопотливый',false,false,NULL,false),
('从','cóng','с, от, из',false,false,NULL,false),
('火车站','huǒchēzhàn','железнодорожный вокзал',true,false,NULL,false),
('每','měi','каждый',false,false,NULL,false),
('错','cuò','ошибочный, неверный; ошибка',false,false,NULL,false),
('机场','jīchǎng','аэропорт',true,false,NULL,false),
('妹妹','mèimei','младшая сестра',true,false,NULL,false),
('打篮球','dǎ lánqiú','играть в баскетбол',true,false,NULL,false),
('鸡蛋','jīdàn','(куриное) яйцо',true,false,NULL,false),
('门','mén','дверь',true,false,NULL,false),
('大家','dàjiā','все, всяк',false,false,NULL,false),
('件','jiàn','(счётное слово для одежды, дел)',false,false,NULL,false),
('面条儿','miàntiáor','лапша',true,false,NULL,false),
('到','dào','прибывать, достигать; до',false,false,NULL,false),
('教室','jiàoshì','класс, аудитория',true,false,NULL,false),
('男','nán','мужской; мужчина',true,false,NULL,false),
('得','de','(структурная частица степени)',false,false,NULL,false),
('姐姐','jiějie','старшая сестра',true,false,NULL,false),
('您','nín','Вы (вежливое)',false,false,NULL,false),
('等','děng','ждать',true,false,NULL,false),
('介绍','jièshào','представлять, знакомить',false,false,NULL,false),
('牛奶','niúnǎi','молоко',true,false,NULL,false),
('弟弟','dìdi','младший брат',true,false,NULL,false),
('进','jìn','входить',false,false,NULL,false),
('女','nǚ','женский; женщина',true,false,NULL,false),
('第一','dì-yī','первый',false,false,NULL,false),
('近','jìn','близкий',false,false,NULL,false),
('旁边','pángbiān','рядом, сбоку',false,false,NULL,false),
('懂','dǒng','понимать',false,false,NULL,false),
('就','jiù','как раз, только, сразу',false,false,NULL,false),
('跑步','pǎobù','бегать, бег',true,false,NULL,false),
('对','duì','правильный, верный',false,false,NULL,false),
('觉得','juéde','чувствовать, считать, полагать',false,false,NULL,false),
('便宜','piányi','дешёвый',false,false,NULL,false),
('对','duì','к, по отношению к',false,false,NULL,false),
('咖啡','kāfēi','кофе',true,false,NULL,false),
('票','piào','билет',true,false,NULL,false),
('房间','fángjiān','комната',true,false,NULL,false),
('开始','kāishǐ','начинать(ся); начало',false,false,NULL,false),
('妻子','qīzi','жена',true,false,NULL,false),
('非常','fēicháng','очень, чрезвычайно',false,false,NULL,false),
('考试','kǎoshì','сдавать экзамен; экзамен',true,false,NULL,false),
('起床','qǐchuáng','вставать (с кровати)',true,false,NULL,false),
('服务员','fúwùyuán','официант, обслуживающий персонал',true,false,NULL,false),
('可能','kěnéng','возможно, может быть',false,false,NULL,false),
('千','qiān','тысяча',false,false,NULL,false),
('铅笔','qiānbǐ','карандаш',true,false,NULL,false),
('玩','wán','играть, развлекаться',true,false,NULL,false),
('一下','yīxià','(кратковременность действия)',false,false,NULL,false),
('晴','qíng','ясный, солнечный (о погоде)',true,false,NULL,false),
('晚上','wǎnshang','вечер',true,false,NULL,false),
('已经','yǐjing','уже',false,false,NULL,false),
('去年','qùnián','прошлый год',false,false,NULL,false),
('往','wǎng','в сторону, по направлению к',false,false,NULL,false),
('意思','yìsi','значение, смысл',false,false,NULL,false),
('让','ràng','позволять, просить, заставлять',false,false,NULL,false),
('为什么','wèishénme','почему, зачем',false,false,NULL,false),
('因为……所以……','yīnwèi…… suǒyǐ……','потому что... поэтому...',false,false,NULL,false),
('日','rì','день; солнце',false,false,NULL,false),
('问','wèn','спрашивать',true,false,NULL,false),
('阴','yīn','пасмурный',true,false,NULL,false),
('上班','shàngbān','идти на работу, работать',true,false,NULL,false),
('问题','wèntí','вопрос, проблема',false,false,NULL,false),
('游泳','yóuyǒng','плавать',true,false,NULL,false),
('身体','shēntǐ','тело; здоровье',true,false,NULL,false),
('西瓜','xīguā','арбуз',true,false,NULL,false),
('右边','yòubian','справа, правая сторона',false,false,NULL,false),
('生病','shēngbìng','заболеть, болеть',true,false,NULL,false),
('希望','xīwàng','надеяться; надежда',false,false,NULL,false),
('鱼','yú','рыба',true,false,NULL,false),
('生日','shēngrì','день рождения',true,false,NULL,false),
('洗','xǐ','мыть, стирать',true,false,NULL,false),
('远','yuǎn','далёкий',false,false,NULL,false),
('时间','shíjiān','время',false,false,NULL,false),
('小时','xiǎoshí','час',false,false,NULL,false),
('运动','yùndòng','заниматься спортом; спорт',true,false,NULL,false),
('事情','shìqing','дело, событие',false,false,NULL,false),
('笑','xiào','смеяться, улыбаться',true,false,NULL,false),
('再','zài','снова, ещё раз',false,false,NULL,false),
('手表','shǒubiǎo','наручные часы',true,false,NULL,false),
('新','xīn','новый',false,false,NULL,false),
('早上','zǎoshang','утро (раннее)',true,false,NULL,false),
('手机','shǒujī','мобильный телефон',true,false,NULL,false),
('姓','xìng','носить фамилию; фамилия',false,false,NULL,false),
('丈夫','zhàngfu','муж',true,false,NULL,false),
('说话','shuōhuà','говорить, разговаривать',true,false,NULL,false),
('休息','xiūxi','отдыхать; отдых',true,false,NULL,false),
('找','zhǎo','искать',false,false,NULL,false),
('送','sòng','дарить; провожать; доставлять',true,false,NULL,false),
('雪','xuě','снег',true,false,NULL,false),
('着','zhe','(видовая частица длительности)',false,false,NULL,false),
('虽然……但是……','suīrán…… dànshì……','хотя... но...',false,false,NULL,false),
('颜色','yánsè','цвет',true,false,NULL,false),
('真','zhēn','настоящий; действительно',false,false,NULL,false),
('它','tā','оно',false,false,NULL,false),
('眼睛','yǎnjing','глаз, глаза',true,false,NULL,false),
('正在','zhèngzài','(прямо) сейчас (длительное действие)',false,false,NULL,false),
('踢足球','tī zúqiú','играть в футбол',true,false,NULL,false),
('羊肉','yángròu','баранина',true,false,NULL,false),
('知道','zhīdào','знать',false,false,NULL,false),
('题','tí','задача, вопрос (в тесте)',false,false,NULL,false),
('药','yào','лекарство',true,false,NULL,false),
('准备','zhǔnbèi','готовиться, подготовить',false,false,NULL,false),
('跳舞','tiàowǔ','танцевать',true,false,NULL,false),
('要','yào','хотеть; нужно; собираться',false,false,NULL,false),
('走','zǒu','идти, ходить; уходить',true,false,NULL,false),
('外','wài','снаружи, вне',false,false,NULL,false),
('也','yě','тоже, также',false,false,NULL,false),
('最','zuì','самый',false,false,NULL,false),
('完','wán','заканчивать(ся)',false,false,NULL,false),
('一起','yìqǐ','вместе',false,false,NULL,false),
('左边','zuǒbian','слева, левая сторона',false,false,NULL,false)
on conflict do nothing;

-- 校验：执行完后在 SQL Editor 跑下面这句，应看到 300：
-- select count(*) from words;
