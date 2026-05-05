import React, { useState, useEffect } from 'react'
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

const LOCALHOST_ORIGINS = ['localhost', '127.0.0.1']

function isLocalhost() {
  return LOCALHOST_ORIGINS.includes(window.location.hostname)
}

function StatusBar() {
  const queue = useCaptchaStore((s) => s.queue)
  const unsolved = queue.filter((q) => !q.solved)
  const isActive = unsolved.length > 0
  const activeId = isActive ? unsolved[0].id : null
  const sseError = useCaptchaStore((s) => s.sseError)
  const [loading, setLoading] = useState(false)
  const apiKey = useCaptchaStore((s) => s.apiKey)
  const clearApiKey = useCaptchaStore((s) => s.clearApiKey)
  const [showChange, setShowChange] = useState(false)
  const [showTestInput, setShowTestInput] = useState(false)
  const [testReservationId, setTestReservationId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [apiLabel, setApiLabel] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) {
      setIsAdmin(false)
      return
    }
    fetch('/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (!r.ok) throw new Error()
        setIsAdmin(true)
      })
      .catch(() => {
        setIsAdmin(false)
      })
  }, [])

  useEffect(() => {
    if (!apiKey) {
      setApiLabel(null)
      return
    }
    fetch(`/validate-key?api_key=${encodeURIComponent(apiKey)}`)
      .then((r) => r.json())
      .then((data) => {
        setApiLabel(data.label || null)
      })
      .catch(() => {
        setApiLabel(null)
      })
  }, [apiKey])

  const handleTestRun = async () => {
    setLoading(true)
    try {
      await fetch('/trigger-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, reservation_id: testReservationId || undefined }),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClearKey = () => {
    clearApiKey()
    setShowChange(false)
  }

  const localMode = isLocalhost()

  const openTestPage = (path) => {
    const url = `${window.location.origin}${path}`
    window.open(url, '_blank')
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        <div className={'status-dot' + (sseError ? ' error' : isActive ? '' : ' idle')} />
        <div className="status-text">
          {isActive
            ? `Активная: <strong>${activeId}</strong>`
            : 'Ожидание запросов…'}
        </div>
        {localMode && (
          <span className="local-badge">LOCAL</span>
        )}
        {sseError && (
          <span className="sse-error-text">{sseError}</span>
        )}
      </div>
      <div className="status-right">
        {localMode && (
          <div className="test-links">
            <button className="test-link-btn" onClick={() => openTestPage('/test-injector/edit')}>Тест: Создание</button>
            <button className="test-link-btn" onClick={() => openTestPage('/test-injector/reschedule')}>Тест: Перенос</button>
          </div>
        )}
        {apiKey && (
          <div className="status-api-key">
            <span className="status-api-key-text">{apiLabel || maskKey(apiKey)}</span>
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
        {showTestInput && (
          <input
            className="test-res-input"
            placeholder="Reservation ID"
            value={testReservationId}
            onChange={(e) => setTestReservationId(e.target.value)}
            onBlur={() => setShowTestInput(false)}
            autoFocus
          />
        )}
        <button
          className="test-run-btn"
          onClick={() => setShowTestInput(true)}
          disabled={loading}
        >
          {loading ? 'Запуск...' : 'Тестовый запуск'}
        </button>
        {testReservationId && !showTestInput && (
          <button
            className="test-run-btn"
            onClick={handleTestRun}
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
          >
            {loading ? '...' : `▶ ${testReservationId}`}
          </button>
        )}
        {isAdmin && (
          <Link to="/admin" className="injector-link admin-link">
            Admin
          </Link>
        )}
      </div>
    </div>
  )
}

export default React.memo(StatusBar)
