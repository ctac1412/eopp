import React, { useState, useEffect, useCallback } from 'react'
import useSSE from './hooks/useSSE'
import useCaptchaStore from './store/useCaptchaStore'
import StatusBar from './components/StatusBar'
import CaptchaGrid from './components/CaptchaGrid'
import LogViewer from './components/LogViewer'
import AuthWizard from './components/AuthWizard'
import UsageHistory from './components/UsageHistory'

function App() {
  const apiKey = useCaptchaStore((s) => s.apiKey)
  const [showWizard, setShowWizard] = useState(!apiKey)
  const [activeTab, setActiveTab] = useState('captchas')

  const handleAuthenticated = useCallback(() => {
    setShowWizard(false)
  }, [])

  useEffect(() => {
    if (!apiKey) {
      setShowWizard(true)
    }
  }, [apiKey])

  if (showWizard) {
    return <AuthWizard onAuthenticated={handleAuthenticated} />
  }

  useSSE()

  return (
    <div className="container">
      <StatusBar />
      <div className="captcha-tabs">
        <button
          className={`captcha-tab ${activeTab === 'captchas' ? 'captcha-tab-active' : ''}`}
          onClick={() => setActiveTab('captchas')}
        >
          Капчи
        </button>
        <button
          className={`captcha-tab ${activeTab === 'history' ? 'captcha-tab-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          История
        </button>
      </div>
      {activeTab === 'captchas' ? (
        <div className="captcha-content-area">
          <CaptchaGrid />
          <LogViewer />
        </div>
      ) : (
        <UsageHistory />
      )}
    </div>
  )
}

export default App
