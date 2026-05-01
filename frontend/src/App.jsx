import React, { useState, useEffect } from 'react'
import useSSE from './hooks/useSSE'
import useCaptchaStore from './store/useCaptchaStore'
import StatusBar from './components/StatusBar'
import CaptchaGrid from './components/CaptchaGrid'
import LogViewer from './components/LogViewer'

function ApiKeyInput() {
  const apiKey = useCaptchaStore((s) => s.apiKey)
  const setApiKey = useCaptchaStore((s) => s.setApiKey)
  const [value, setValue] = useState(apiKey)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setValue(apiKey)
  }, [apiKey])

  const handleSubmit = () => {
    setApiKey(value.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="api-key-input">
        <input
          className="injector-form-input"
          type="text"
          placeholder="API ключ (необязательно)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus
        />
        <button className="injector-btn" onClick={handleSubmit}>OK</button>
        <button className="injector-btn" onClick={() => { setEditing(false); setValue(apiKey) }}>Отмена</button>
      </div>
    )
  }

  return (
    <div className="api-key-display" onClick={() => setEditing(true)} style={{ cursor: 'pointer' }}>
      {apiKey ? `Ключ: ${apiKey.slice(0, 8)}...` : 'Нажмите для ввода API ключа'}
    </div>
  )
}

function App() {
  useSSE()

  return (
    <div className="container">
      <ApiKeyInput />
      <StatusBar />
      <CaptchaGrid />
      <LogViewer />
    </div>
  )
}

export default App
