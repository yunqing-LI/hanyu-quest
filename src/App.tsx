import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import Home from './pages/Home'
import Login from './pages/Login'
import Practice from './pages/Practice'
import Progress from './pages/Progress'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import AuthConfirm from './pages/AuthConfirm'
import ResetPassword from './pages/ResetPassword'
import NotFound from './pages/NotFound'

// 与 main.tsx 中写入的标记一致：邮箱确认链接（默认邮件模板）跳回本站时置位
const EMAIL_CONFIRMED_KEY = 'hq-email-confirmed'
// 与 main.tsx 中写入的标记一致：重置密码链接跳回本站时置位
const PW_RECOVERY_KEY = 'hq-pw-recovery'

export default function App() {
  // 刚通过邮件链接（注册确认 type=signup / 重置密码 type=recovery）进入时：
  // 由 main.tsx 在 Supabase 消费 hash 之前记下标记，这里引导一次到对应落地页。
  // 必须在跳转后复位，否则 App 存活期间会一直拦所有导航。
  const [landing, setLanding] = useState<'confirm' | 'reset' | null>(() =>
    sessionStorage.getItem(EMAIL_CONFIRMED_KEY) === '1'
      ? 'confirm'
      : sessionStorage.getItem(PW_RECOVERY_KEY) === '1'
        ? 'reset'
        : null,
  )
  useEffect(() => {
    if (landing) {
      sessionStorage.removeItem(EMAIL_CONFIRMED_KEY)
      sessionStorage.removeItem(PW_RECOVERY_KEY)
      setLanding(null)
    }
  }, [landing])

  if (landing === 'confirm') {
    return <Navigate to="/auth/confirm" replace state={{ confirmed: true }} />
  }

  if (landing === 'reset') {
    return <Navigate to="/auth/reset" replace />
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/confirm" element={<AuthConfirm />} />
      <Route path="/auth/reset" element={<ResetPassword />} />
      <Route path="/" element={<Home />} />
      <Route path="/practice" element={<Practice />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
