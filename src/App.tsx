import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Login from './pages/Login'
import Practice from './pages/Practice'
import Progress from './pages/Progress'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import AuthConfirm from './pages/AuthConfirm'
import NotFound from './pages/NotFound'

export default function App() {
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
