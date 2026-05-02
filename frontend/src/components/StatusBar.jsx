import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import useCaptchaStore from '../store/useCaptchaStore'

function maskKey(key) {
  if (!key || key.length === 0) return '••••••'
  if (key.length <= 8) {
    if (key.length === 1) return key[0]
    return key[0] + '•'.repeat(key.length - 2) + key[key.length - 1]
  }
  return key.slice(0, 4) + '••••••' + key.slice(-4)
}

function StatusBar() {
  const queue = useCaptchaStore((s) => s.queue)
  const unsolved = queue.filter((q) => !q.solved)
  const isActive = unsolved.length > 0
  const activeId = isActive ? unsolved[0].id : null
  const [loading, setLoading] = useState(false)
  const apiKey = useCaptchaStore((s) => s.apiKey)
  const clearApiKey = useCaptchaStore((s) => s.clearApiKey)
  const [showChange, setShowChange] = useState(false)

  const handleTestRun = async () => {
    setLoading(true)
    try {
      await fetch('/trigger-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClearKey = () => {
    clearApiKey()
    setShowChange(false)
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        <div className={'status-dot' + (isActive ? '' : ' idle')} />
        <div className="status-text">
          {isActive
            ? `Активная: <strong>${activeId}</strong>`
            : 'Ожидание запросов…'}
        </div>
      </div>
      <div className="status-right">
        {apiKey && (
          <div className="status-api-key">
            <span className="status-api-key-text">{maskKey(apiKey)}</span>
            {showChange ? (
              <div className="status-api-key-actions">
                <button className="status-api-key-confirm" onClick={handleClearKey}>ОК</button>
                <button className="status-api-key-cancel" onClick={() => setShowChange(false)}>Отмена</button>
              </div>
            ) : (
              <button
                className="status-api-key-btn"
                onClick={() => setShowChange(true)}
              >
                Сменить
              </button>
            )}
          </div>
        )}
        <button
          className="test-run-btn"
          onClick={handleTestRun}
          disabled={loading}
        >
          {loading ? 'Запуск...' : 'Тестовый запуск'}
        </button>
        <Link to="/admin" className="injector-link admin-link">
          Admin
        </Link>
      </div>
    </div>
  )
}

export default React.memo(StatusBar)
