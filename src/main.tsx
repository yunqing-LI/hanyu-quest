import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { AppProviders } from '@/providers/app'
import './index.css'
import App from './App.tsx'

// Supabase 免费版不能自定义邮件模板（需自建 SMTP），注册确认邮件用默认模板：
// 用户点确认链接后经 Supabase 验证，带着 #access_token=...&type=signup 跳回本站。
// 必须在本站 Supabase client 异步消费 hash 之前记下标记，
// App 据此把用户引到"验证成功"页（AuthConfirm 的 state.confirmed 模式）。
if (
  window.location.hash.includes('access_token=') &&
  window.location.hash.includes('type=signup')
) {
  sessionStorage.setItem('hq-email-confirmed', '1')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </HashRouter>
  </StrictMode>,
)
