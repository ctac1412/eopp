import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import useCaptchaStore from '../store/useCaptchaStore'

function StatusBar() {
  const queue = useCaptchaStore((s) => s.queue)
  const unsolved = queue.filter((q) => !q.solved)
  const isActive = unsolved.length > 0
  const activeId = isActive ? unsolved[0].id : null
  const [loading, setLoading] = useState(false)

  const handleTestRun = async () => {
    setLoading(true)
    try {
      await fetch('/trigger-test', { method: 'POST' })
    } finally {
      setLoading(false)
    }
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
        <button
          className="test-run-btn"
          onClick={handleTestRun}
          disabled={loading}
        >
          {loading ? 'Запуск...' : 'Тестовый запуск'}
        </button>
        <Link to="/injector" className="injector-link">
          Injector Script
        </Link>
      </div>
    </div>
  )
}

export default React.memo(StatusBar)
