# Ханьюй-квест（汉字闯关）

> «китайский с Ли Лаоши» —— 面向俄语母语中文学习者（HSK 3–5）的每日打卡练习工具。
> 老师布置作业，学生每天完成 30 题，生成 PDF 报告发给老师。

## 架构（2026-09 静态版改造后）

**纯静态前端 + Supabase（Postgres + Auth），无任何 Node 服务进程。**

- 前端：React 19 + TypeScript + Vite 7 + Tailwind CSS 3 + shadcn/ui，hash 路由
- 后端：Supabase（Auth 邮箱+密码 / Postgres 行级安全）
- 部署：GitHub Pages 纯静态站点（GitHub Actions 自动构建）

## 本地开发

```bash
npm install          # 需要 Node.js 18+（推荐 22）
cp .env.example .env # 填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev          # 开发服务器 http://localhost:3000
npm run check        # 类型检查
npm run build        # 产出 dist/（纯静态，任意静态服务器可跑）
npm run preview      # 本地预览构建产物
```

## 常用配置（改完需重新构建部署）

| 配置 | 位置 |
|---|---|
| 班级邀请码 | `contracts/invite.ts`（`INVITE_CODE`） |
| 开发者/教师邮箱 | Supabase 数据库 `developer_emails` 表（Table Editor 管理，仓库不存明文） |
| 每日题量 / SRS 间隔 / 徽章 | `contracts/quest.ts`（核心数值勿随意改） |
| 部署子路径 | `vite.config.ts`（默认读 `.env` 的 `VITE_BASE_PATH`） |

## 文档

- **《上线交接说明.md》**——从零上线全流程（建 Supabase → 建库 → 配置 → 部署 → 验收）
- **《deploy-github-pages.md》**——GitHub Pages 保姆级部署教程
- **`supabase-setup.sql`**——建表 + 索引 + RLS 策略 + 300 词初始词库（Supabase SQL Editor 一键执行）
- **`PROGRESS.md`**——开发进度日志

## 目录速览

```
src/pages/      7 个页面（登录/首页/练习/进度/报告/教师后台/404）
src/lib/quest/  练习引擎（组卷/SRS/打卡/徽章/报告聚合，纯函数）
src/lib/data/   数据访问层（supabase-js 封装）
contracts/      全站常量与规则（唯一修改入口）
db/data/        词库权威数据（words-export.json / hsk1-2.csv）
archive/        旧版全栈后端代码（Hono/tRPC/MySQL，仅供回溯，不参与构建）
```
