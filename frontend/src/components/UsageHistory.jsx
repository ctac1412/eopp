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
            <th>Время</th>
            <th>Статус</th>
            <th>Дата слота</th>
            <th>Reservation ID</th>
            <th>Капча</th>
            <th>Ошибка</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
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
              <td className="admin-history-cid">{r.captcha_id_short || r.captcha_id}</td>
              <td className="admin-history-error-msg">
                {r.error_message || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default UsageHistory
