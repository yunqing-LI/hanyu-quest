import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import Home from './pages/Home'
import Login from './pages/Login'
import Practice from './pages/Practice'
import Progress from './pages/Progress'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import AuthConfirm from './pages/AuthConfirm'
import NotFound from './pages/NotFound'

// 与 main.tsx 中写入的标记一致：邮箱确认链接（默认邮件模板）跳回本站时置位
const EMAIL_CONFIRMED_KEY = 'hq-email-confirmed'

export default function App() {
  // 刚通过邮箱确认链接进入（带 #access_token=...&type=signup）：
  // 由 main.tsx 在 Supabase 消费 hash 之前记下标记，这里引导一次到"验证成功"落地页。
  // 必须在跳转后复位，否则 App 存活期间会一直拦所有导航。
  const [emailConfirmed, setEmailConfirmed] = useState(
    () => sessionStorage.getItem(EMAIL_CONFIRMED_KEY) === '1',
  )
  useEffect(() => {
    if (emailConfirmed) {
      sessionStorage.removeItem(EMAIL_CONFIRMED_KEY)
      setEmailConfirmed(false)
    }
  }, [emailConfirmed])

  if (emailConfirmed) {
    return <Navigate to="/auth/confirm" replace state={{ confirmed: true }} />
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/confirm" element={<AuthConfirm />} />
      <Route path="/" element={<Home />} />
      <Route path="/practice" element={<Practice />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
