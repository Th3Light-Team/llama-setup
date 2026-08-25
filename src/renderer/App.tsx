import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import HomePage from '@/pages/HomePage'
import HardwarePage from '@/pages/HardwarePage'
import BinariesPage from '@/pages/BinariesPage'
import LaunchPage from '@/pages/LaunchPage'
import BenchLeaderboardPage from '@/pages/BenchLeaderboardPage'
import RegistryPage from '@/pages/RegistryPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelLibraryPage from '@/pages/ModelLibraryPage'
import OnboardingShell from '@/pages/onboarding/OnboardingShell'
import { ToastProvider } from '@/components/ui/toast'

function AppRoutes() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    window.electron.app.getOnboardingState().then((state) => {
      if (!state?.completedAt) {
        navigate('/onboarding/1', { replace: true })
      }
      setChecked(true)
    }).catch(() => setChecked(true))
  }, [])

  if (!checked) return null

  return (
    <Routes>
      <Route path="/onboarding/:step?" element={<OnboardingShell />} />
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/hardware" element={<HardwarePage />} />
        <Route path="/binaries" element={<BinariesPage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/bench" element={<BenchLeaderboardPage />} />
        <Route path="/registry" element={<RegistryPage />} />
        <Route path="/library" element={<ModelLibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </ToastProvider>
  )
}
