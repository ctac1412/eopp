import React from 'react'
import useSSE from './hooks/useSSE'
import StatusBar from './components/StatusBar'
import CaptchaGrid from './components/CaptchaGrid'
import LogViewer from './components/LogViewer'

function App() {
  useSSE()

  return (
    <div className="container">
      <StatusBar />
      <CaptchaGrid />
      <LogViewer />
    </div>
  )
}

export default App
