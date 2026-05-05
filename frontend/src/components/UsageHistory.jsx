import React, { useState, useEffect, useCallback } from 'react'
import useCaptchaStore from '../store/useCaptchaStore'

function StatusBadge({ status }) {
  const clsMap = {
    confirmed: 'admin-status-confirmed',
    pending: 'admin-status-pending',
    failed: 'admin-status-failed',
  }
  const labelMap = {
    confirmed: 'Подтверждено',
    pending: 'Ожидание',
    failed: 'Ошибка',
  }
  return (
    <span className={`admin-status-badge ${clsMap[status] || ''}`}>
      {labelMap[status] || status}
    </span>
  )
}

function UsageHistory() {
  const apiKey = useCaptchaStore((s) => s.apiKey)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedLogs, setExpandedLogs] = useState({})
  const [expandedConfig, setExpandedConfig] = useState({})
  const [expandedErrors, setExpandedErrors] = useState({})

  const toggleLogs = (id) => {
    setExpandedLogs(p => ({ ...p, [id]: !p[id] }))
  }

  const toggleConfig = (id) => {
    setExpandedConfig(p => ({ ...p, [id]: !p[id] }))
  }

  const toggleError = (id) => {
    setExpandedErrors(p => ({ ...p, [id]: !p[id] }))
  }

  const fetchLogs = useCallback(async () => {
    if (!apiKey) {
      setError('API-ключ не установлен')
      setLoading(false)
      return
    }
    try {
      const resp = await fetch(`/usage-log?api_key=${encodeURIComponent(apiKey)}`)
      if (!resp.ok) {
        if (resp.status === 403) {
          setError('Неверный API-ключ')
        } else {
          setError('Не удалось загрузить историю')
        }
        return
      }
      const data = await resp.json()
      setRecords(data)
      setError('')
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }, [apiKey])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    const interval = setInterval(fetchLogs, 5000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  if (loading) {
    return <div className="admin-history-loading">Загрузка истории...</div>
  }
  if (error) {
    return <div className="admin-history-error">{error}</div>
  }
  if (records.length === 0) {
    return <div className="admin-history-empty">История пуста</div>
  }

  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Время</th>
            <th>Статус</th>
            <th>Дата слота</th>
            <th>Reservation ID</th>
            <th>Капча</th>
            <th>Ошибка</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const isLogsExpanded = expandedLogs[r.id]
            const isConfigExpanded = expandedConfig[r.id]
            const isErrorExpanded = expandedErrors[r.id]
            const hasLogs = r.logs && r.logs.length > 0
            const hasConfig = r.config_json != null
            const hasError = r.error_message != null && r.error_message !== ''
            const errorTruncated = hasError && !isErrorExpanded
              ? (r.error_message.length > 100 ? r.error_message.slice(0, 100) + '…' : r.error_message)
              : null

            return (
              <React.Fragment key={r.id}>
                <tr>
                  <td className="admin-history-id">{r.id}</td>
                  <td className="admin-date">
                    {new Date(r.created_at).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="admin-history-slot-date">{r.slot_date || '—'}</td>
                  <td className="admin-history-resid">{r.reservation_id}</td>
                  <td className="admin-history-cid">{r.captcha_id_short || r.captcha_id || '—'}</td>
                  <td className="admin-history-error-msg">
                    {hasError ? (
                      isErrorExpanded ? (
                        <span
                          style={{ cursor: 'pointer', color: '#f87171', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'visible', maxWidth: 'none' }}
                          onClick={() => toggleError(r.id)}
                        >
                          {r.error_message}
                        </span>
                      ) : (
                        <span
                          style={{ cursor: 'pointer', color: '#f87171' }}
                          onClick={() => toggleError(r.id)}
                          title="Нажмите, чтобы развернуть"
                        >
                          {errorTruncated}
                        </span>
                      )
                    ) : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {hasConfig && (
                        <button
                          className={`admin-btn-sm ${isConfigExpanded ? 'admin-btn-history-open' : 'admin-btn-history'}`}
                          onClick={() => toggleConfig(r.id)}
                        >
                          {isConfigExpanded ? 'Свернуть конфиг' : 'Конфиг'}
                        </button>
                      )}
                      {hasLogs && (
                        <button
                          className={`admin-btn-sm ${isLogsExpanded ? 'admin-btn-history-open' : 'admin-btn-history'}`}
                          onClick={() => toggleLogs(r.id)}
                        >
                          {isLogsExpanded ? 'Свернуть логи' : 'Логи'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isConfigExpanded && hasConfig && (
                  <tr>
                    <td colSpan={8} className="admin-plugin-logs-cell">
                      <div className="admin-plugin-logs-wrapper">
                        <div className="admin-plugin-logs-body">
                          <pre style={{ margin: 0, fontSize: '11px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(r.config_json, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {isLogsExpanded && hasLogs && (
                  <tr>
                    <td colSpan={8} className="admin-plugin-logs-cell">
                      <div className="admin-plugin-logs-wrapper">
                        <div className="admin-plugin-logs-body">
                          {r.logs.map((line, i) => (
                            <div key={i} className="admin-plugin-log-line">{line}</div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default UsageHistory
