import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

function adminHeaders(token) {
  return { 'Content-Type': 'application/json', 'X-Admin-Token': token }
}

function adminHeadersJson(token) {
  return { 'X-Admin-Token': token }
}

function AdminPage() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('admin_token') || null)
  const [authInput, setAuthInput] = useState('')
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('keys')
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [newKey, setNewKey] = useState(null)
  const [createForm, setCreateForm] = useState({ label: '', maxUses: '' })
  const [editForm, setEditForm] = useState({ label: '', maxUses: '', active: true })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState({})
  const [historyLoading, setHistoryLoading] = useState({})
  const [expandedLogs, setExpandedLogs] = useState({})
  const intervalRef = useRef(null)

  // Streams
  const [streams, setStreams] = useState([])
  const [streamsLoading, setStreamsLoading] = useState(false)

  // Test stats
  const [testStats, setTestStats] = useState(null)
  const [testStatsLoading, setTestStatsLoading] = useState(false)

  // Benchmark
  const [benchmark, setBenchmark] = useState(null)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [benchmarkRunning, setBenchmarkRunning] = useState(false)

  const fetchKeys = useCallback(async (token) => {
    const t = token || adminToken
    if (!t) return
    try {
      const res = await fetch('/api-keys', { headers: adminHeadersJson(t) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setKeys(Array.isArray(data) ? data : (data.keys || []))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [adminToken])

  const fetchStreams = useCallback(async (token) => {
    const t = token || adminToken
    if (!t) return
    setStreamsLoading(true)
    try {
      const res = await fetch('/admin/streams', { headers: adminHeadersJson(t) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStreams(Array.isArray(data) ? data : [])
    } catch (err) {
      setStreams([])
    } finally {
      setStreamsLoading(false)
    }
  }, [adminToken])

  const fetchTestStats = useCallback(async (token) => {
    const t = token || adminToken
    if (!t) return
    setTestStatsLoading(true)
    try {
      const res = await fetch('/admin/test-stats', { headers: adminHeadersJson(t) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTestStats(data)
    } catch (err) {
      setTestStats(null)
    } finally {
      setTestStatsLoading(false)
    }
  }, [adminToken])

  const runBenchmark = useCallback(async (token) => {
    const t = token || adminToken
    if (!t) return
    setBenchmarkRunning(true)
    setBenchmarkLoading(true)
    try {
      const res = await fetch('/admin/benchmark', {
        method: 'POST',
        headers: adminHeaders(t),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setBenchmark(data)
    } catch (err) {
      setBenchmark({ error: err.message })
    } finally {
      setBenchmarkLoading(false)
      setBenchmarkRunning(false)
    }
  }, [adminToken])

  useEffect(() => {
    if (adminToken) {
      fetchKeys(adminToken)
    }
  }, [adminToken])

  useEffect(() => {
    if (!adminToken) return
    intervalRef.current = setInterval(() => fetchKeys(adminToken), 5000)
    return () => clearInterval(intervalRef.current)
  }, [adminToken, fetchKeys])

  useEffect(() => {
    if (activeTab === 'streams' && adminToken) {
      fetchStreams(adminToken)
      const id = setInterval(() => fetchStreams(adminToken), 3000)
      return () => clearInterval(id)
    }
  }, [activeTab, adminToken, fetchStreams])

  useEffect(() => {
    if (activeTab === 'teststats' && adminToken) {
      fetchTestStats(adminToken)
    }
  }, [activeTab, adminToken, fetchTestStats])

  const doAuth = async () => {
    setAuthError(null)
    setAuthLoading(true)
    try {
      const res = await fetch('/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authInput }),
      })
      if (!res.ok) throw new Error('Неверный токен')
      const token = authInput
      localStorage.setItem('admin_token', token)
      setAdminToken(token)
      setAuthError(null)
      fetchKeys(token)
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    setAdminToken(null)
    setKeys([])
    setExpandedHistory({})
    setExpandedLogs({})
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      const body = { label: createForm.label }
      if (createForm.maxUses) {
        body.max_uses = parseInt(createForm.maxUses, 10)
      }
      const res = await fetch('/api-keys', {
        method: 'POST',
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setNewKey(data)
      setCreateForm({ label: '', maxUses: '' })
      setShowCreate(false)
      fetchKeys(adminToken)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    if (!showEdit) return
    try {
      const body = { label: editForm.label, active: editForm.active }
      if (editForm.maxUses !== '') {
        body.max_uses = parseInt(editForm.maxUses, 10)
      } else {
        body.max_uses = null
      }
      const res = await fetch(`/api-keys/${showEdit}`, {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setShowEdit(null)
      fetchKeys(adminToken)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api-keys/${id}`, {
        method: 'DELETE',
        headers: adminHeadersJson(adminToken),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setConfirmDelete(null)
      fetchKeys(adminToken)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleResetUsage = async (id) => {
    try {
      const res = await fetch(`/api-keys/${id}/reset-usage`, {
        method: 'POST',
        headers: adminHeadersJson(adminToken),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      fetchKeys(adminToken)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleActive = async (keyObj) => {
    try {
      const res = await fetch(`/api-keys/${keyObj.id}`, {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ active: !keyObj.active }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      fetchKeys(adminToken)
    } catch (err) {
      setError(err.message)
    }
  }

  const openEdit = (keyObj) => {
    setEditForm({
      label: keyObj.label || '',
      maxUses: keyObj.max_uses ?? '',
      active: keyObj.active,
    })
    setShowEdit(keyObj.id)
  }

  const fetchUsageHistory = async (keyId) => {
    if (expandedHistory[keyId]) return
    setHistoryLoading(p => ({ ...p, [keyId]: true }))
    try {
      const res = await fetch(`/usage-log?api_key_id=${keyId}`, {
        headers: adminHeadersJson(adminToken),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setExpandedHistory(p => ({ ...p, [keyId]: Array.isArray(data) ? data : (data.logs || data.records || []) }))
    } catch (err) {
      setExpandedHistory(p => ({ ...p, [keyId]: null }))
    } finally {
      setHistoryLoading(p => ({ ...p, [keyId]: false }))
    }
  }

  const toggleHistory = (keyId) => {
    if (expandedHistory[keyId] !== undefined) {
      setExpandedHistory(p => { const n = { ...p }; delete n[keyId]; return n })
    } else {
      fetchUsageHistory(keyId)
    }
  }

  const togglePluginLogs = (usageLogId) => {
    setExpandedLogs(p => ({ ...p, [usageLogId]: !p[usageLogId] }))
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
    })
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (!adminToken) {
    return (
      <div className="admin-page">
        <div className="admin-auth-wrapper">
          <div className="admin-auth-box">
            <h2>Админ-панель</h2>
            <p className="admin-auth-desc">Введите ADMIN_TOKEN для доступа</p>
            <form
              className="admin-auth-form"
              onSubmit={(e) => { e.preventDefault(); doAuth() }}
            >
              <input
                type="password"
                value={authInput}
                onChange={(e) => setAuthInput(e.target.value)}
                placeholder="Token"
                className="admin-input"
                required
                autoFocus
              />
              <button
                type="submit"
                className="admin-btn-primary"
                disabled={authLoading}
              >
                {authLoading ? 'Проверка…' : 'Войти'}
              </button>
            </form>
            {authError && <div className="admin-auth-error">{authError}</div>}
            <Link to="/" className="back-link" style={{ marginTop: '10px', display: 'inline-block' }}>← Назад к капчам</Link>
          </div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'keys', label: 'API Keys' },
    { id: 'streams', label: 'Стримы' },
    { id: 'teststats', label: 'Тесткейсы' },
    { id: 'benchmark', label: 'Бенчмарк' },
  ]

  const renderStreamsTab = () => (
    <div>
      <h2 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>Подключённые SSE-клиенты</h2>
      {streamsLoading && streams.length === 0 && <div className="admin-loading">Загрузка…</div>}
      {streams.length === 0 && !streamsLoading && (
        <div className="admin-empty">Нет активных подключений</div>
      )}
      {streams.length > 0 && (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>API Key ID</th>
                <th>Label</th>
                <th>IP</th>
                <th>Подключён</th>
                <th>Длительность</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s, idx) => {
                const elapsed = s.connected_at ? Math.floor((Date.now() / 1000 - s.connected_at)) : 0
                const durationStr = elapsed >= 3600 ? `${Math.floor(elapsed / 3600)}ч ${Math.floor((elapsed % 3600) / 60)}м`
                  : elapsed >= 60 ? `${Math.floor(elapsed / 60)}м ${elapsed % 60}с`
                  : `${elapsed}с`
                return (
                  <tr key={idx}>
                    <td className="admin-id">{s.api_key_id ?? '—'}</td>
                    <td className="admin-label">{s.api_key_label || '—'}</td>
                    <td>{s.ip || '—'}</td>
                    <td className="admin-date">{s.connected_at_iso ? formatDate(s.connected_at_iso) : '—'}</td>
                    <td>{durationStr}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const renderTestStatsTab = () => (
    <div>
      <h2 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>Статистика тестовых кейсов</h2>
      {testStatsLoading && !testStats && <div className="admin-loading">Загрузка…</div>}
      {testStats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', maxWidth: '400px' }}>
          <div style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2a2a4a' }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Помеченные (valid/)</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#4ade80' }}>{testStats.labeled_count}</div>
          </div>
          <div style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2a2a4a' }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Без пометки (no_valid/)</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{testStats.unlabeled_count}</div>
          </div>
        </div>
      )}
    </div>
  )

  const renderBenchmarkTab = () => (
    <div>
      <h2 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>Бенчмарк решателя капч</h2>
      <button
        className="admin-btn-primary"
        onClick={() => runBenchmark(adminToken)}
        disabled={benchmarkRunning}
        style={{ marginBottom: '16px' }}
      >
        {benchmarkRunning ? 'Выполняется…' : 'Запустить бенчмарк'}
      </button>
      {benchmarkLoading && !benchmark && <div className="admin-loading">Загрузка…</div>}
      {benchmark && (
        <div>
          {benchmark.error ? (
            <div style={{ padding: '12px', background: '#2a1a1a', borderRadius: '8px', border: '1px solid #4a2a2a', color: '#f87171', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
              Ошибка: {benchmark.error}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2a2a4a' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Всего тестов</div>
                <div style={{ fontSize: '28px', fontWeight: 700 }}>{benchmark.total}</div>
              </div>
              <div style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2a2a4a' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Пройдено</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#4ade80' }}>{benchmark.passed}</div>
              </div>
              <div style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2a2a4a' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Покрытие</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: benchmark.coverage_percent >= 90 ? '#4ade80' : benchmark.coverage_percent >= 70 ? '#f59e0b' : '#f87171' }}>
                  {benchmark.coverage_percent}%
                </div>
              </div>
            </div>
          )}
          {benchmark.last_run_timestamp && (
            <div style={{ fontSize: '12px', color: '#666' }}>Последний запуск: {formatDate(benchmark.last_run_timestamp)}</div>
          )}
          {benchmark.best_config && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#1a1a2e', borderRadius: '8px', border: '1px solid #2a2a4a', fontSize: '13px', fontFamily: 'monospace' }}>
              <div style={{ color: '#888', marginBottom: '4px' }}>Лучший конфиг:</div>
              <div>edge_trim={benchmark.best_config.edge_trim}  W_DISC={benchmark.best_config.W_DISC}  W_SSIM={benchmark.best_config.W_SSIM}  W_COH={benchmark.best_config.W_COH}  W_SOBEL={benchmark.best_config.W_SOBEL}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Админ-панель</h1>
        <div className="admin-header-right">
          {activeTab === 'keys' && (
            <button
              className="admin-btn-primary"
              onClick={() => setShowCreate(true)}
            >
              + Новый ключ
            </button>
          )}
          <button
            className="admin-btn-secondary"
            onClick={handleLogout}
            style={{ fontSize: '11px', padding: '5px 10px' }}
          >
            Выйти
          </button>
          <Link to="/" className="back-link">← Назад к капчам</Link>
        </div>
      </div>

      <div className="admin-tabs" style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.id ? '#3b82f6' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#888',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="admin-error">{error}</div>}

      {activeTab === 'keys' && (
        <>
          {newKey && (
            <div className="admin-new-key">
              <div className="admin-new-key-title">Ключ создан!</div>
              <p className="admin-new-key-hint">Этот ключ отображается только один раз. Скопируйте и сохраните.</p>
              <div className="admin-new-key-value">
                <input
                  type="text"
                  readOnly
                  value={newKey.key}
                  className="admin-key-input"
                />
                <button
                  className="admin-btn-copy"
                  onClick={() => copyToClipboard(newKey.key)}
                >
                  Копировать
                </button>
              </div>
              <button
                className="admin-btn-secondary"
                onClick={() => setNewKey(null)}
              >
                Закрыть
              </button>
            </div>
          )}

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>ID</th>
                  <th>Ключ</th>
                  <th>Создан</th>
                  <th>Использование</th>
                  <th>Активен</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {loading && keys.length === 0 ? (
                  <tr><td colSpan={8} className="admin-loading">Загрузка…</td></tr>
                ) : keys.length === 0 ? (
                  <tr><td colSpan={8} className="admin-empty">Нет ключей</td></tr>
                ) : (
                  keys.map((k) => {
                    const isExpanded = expandedHistory[k.id] !== undefined
                    const historyData = expandedHistory[k.id]
                    return (
                      <React.Fragment key={k.id}>
                        <tr>
                          <td className="admin-label">{k.label || '—'}</td>
                          <td className="admin-id">{String(k.id)}</td>
                          <td>
                            <span
                              className="admin-key-masked"
                              onClick={() => copyToClipboard(k.key)}
                              title="Нажмите, чтобы скопировать"
                            >
                              {k.masked_key || '—'}
                            </span>
                          </td>
                          <td className="admin-date">{formatDate(k.created_at)}</td>
                          <td className="admin-usage">
                            {k.usage_count ?? 0}
                            {k.max_uses != null ? ` / ${k.max_uses}` : ''}
                          </td>
                          <td>
                            <button
                              className={'admin-toggle ' + (k.active ? 'admin-toggle-on' : 'admin-toggle-off')}
                              onClick={() => handleToggleActive(k)}
                              title={k.active ? 'Деактивировать' : 'Активировать'}
                            >
                              <span className="admin-toggle-dot" />
                            </button>
                          </td>
                          <td className="admin-actions">
                            <button className="admin-btn-sm admin-btn-edit" onClick={() => openEdit(k)}>
                              Изменить
                            </button>
                            <button className="admin-btn-sm admin-btn-reset" onClick={() => handleResetUsage(k.id)}>
                              Сбросить
                            </button>
                            <button className="admin-btn-sm admin-btn-del" onClick={() => setConfirmDelete(k.id)}>
                              Удалить
                            </button>
                          </td>
                          <td>
                            <button
                              className={'admin-btn-sm ' + (isExpanded ? 'admin-btn-history-open' : 'admin-btn-history')}
                              onClick={() => toggleHistory(k.id)}
                            >
                              {isExpanded ? 'Свернуть' : 'История'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="admin-history-cell">
                              <div className="admin-history-wrapper">
                                {historyLoading[k.id] && <div className="admin-history-loading">Загрузка…</div>}
                                {historyData === null && <div className="admin-history-error">Ошибка загрузки</div>}
                                {historyData && historyData.length === 0 && <div className="admin-history-empty">Нет записей</div>}
                                {historyData && historyData.length > 0 && (
                                  <table className="admin-history-table">
                                    <thead>
                                      <tr>
                                        <th>Время</th>
                                        <th>Reservation ID</th>
                                        <th>Captcha ID</th>
                                        <th>Статус</th>
                                        <th>Этап</th>
                                        <th>Ошибка</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {historyData.map((entry) => {
                                        const isPluginExpanded = expandedLogs[entry.id]
                                        const pluginData = entry.logs
                                        return (
                                          <React.Fragment key={entry.id}>
                                            <tr>
                                              <td className="admin-history-time">{formatDate(entry.created_at)}</td>
                                              <td className="admin-history-resid">{entry.reservation_id || '—'}</td>
                                              <td className="admin-history-cid">{entry.captcha_id_short || entry.captcha_id || '—'}</td>
                                              <td>
                                                <span className={
                                                  'admin-status-badge ' +
                                                  (entry.status === 'confirmed' ? 'admin-status-confirmed' :
                                                   entry.status === 'pending' ? 'admin-status-pending' :
                                                   'admin-status-failed')
                                                }>
                                                  {entry.status === 'confirmed' ? 'Подтверждено' :
                                                   entry.status === 'pending' ? 'Ожидание' :
                                                   'Ошибка'}
                                                </span>
                                              </td>
                                              <td className="admin-history-stage">
                                                {entry.status === 'failed' ? (entry.error_stage || '—') : '—'}
                                              </td>
                                              <td className="admin-history-error-msg">
                                                {entry.status === 'failed' && entry.error_message
                                                  ? (entry.error_message.length > 100
                                                    ? entry.error_message.slice(0, 100) + '…'
                                                    : entry.error_message)
                                                  : '—'}
                                              </td>
                                              <td className="admin-history-slot-date">
                                                {entry.slot_date || '—'}
                                              </td>
                                              <td>
                                                {pluginData && pluginData.length > 0 && (
                                                  <button
                                                    className={'admin-btn-sm ' + (isPluginExpanded ? 'admin-btn-history-open' : 'admin-btn-history')}
                                                    onClick={() => togglePluginLogs(entry.id)}
                                                  >
                                                    {isPluginExpanded ? 'Свернуть логи' : 'Логи'}
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                            {isPluginExpanded && pluginData && pluginData.length > 0 && (
                                              <tr>
                                                <td colSpan={8} className="admin-plugin-logs-cell">
                                                  <div className="admin-plugin-logs-wrapper">
                                                    <div className="admin-plugin-logs-body">
                                                      {pluginData.map((line, idx) => (
                                                        <div key={idx} className="admin-plugin-log-line">{line}</div>
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
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'streams' && renderStreamsTab()}
      {activeTab === 'teststats' && renderTestStatsTab()}
      {activeTab === 'benchmark' && renderBenchmarkTab()}

      {showCreate && (
        <div className="admin-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Создать новый ключ</h3>
            <form onSubmit={handleCreate}>
              <label className="admin-form-label">
                Label
                <input
                  type="text"
                  value={createForm.label}
                  onChange={(e) => setCreateForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="напр. production"
                  className="admin-input"
                  required
                />
              </label>
              <label className="admin-form-label">
                Max Uses (пусто = без лимита)
                <input
                  type="number"
                  value={createForm.maxUses}
                  onChange={(e) => setCreateForm((p) => ({ ...p, maxUses: e.target.value }))}
                  placeholder="∞"
                  className="admin-input"
                  min="1"
                />
              </label>
              <div className="admin-modal-actions">
                <button type="button" className="admin-btn-secondary" onClick={() => setShowCreate(false)}>
                  Отмена
                </button>
                <button type="submit" className="admin-btn-primary">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="admin-modal-overlay" onClick={() => setShowEdit(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Редактировать ключ</h3>
            <form onSubmit={handleEdit}>
              <label className="admin-form-label">
                Label
                <input
                  type="text"
                  value={editForm.label}
                  onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))}
                  className="admin-input"
                />
              </label>
              <label className="admin-form-label">
                Max Uses (пусто = без лимита)
                <input
                  type="number"
                  value={editForm.maxUses}
                  onChange={(e) => setEditForm((p) => ({ ...p, maxUses: e.target.value }))}
                  placeholder="∞"
                  className="admin-input"
                  min="1"
                />
              </label>
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm((p) => ({ ...p, active: e.target.checked }))}
                />
                Активен
              </label>
              <div className="admin-modal-actions">
                <button type="button" className="admin-btn-secondary" onClick={() => setShowEdit(null)}>
                  Отмена
                </button>
                <button type="submit" className="admin-btn-primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal admin-modal-small" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение</h3>
            <p className="admin-confirm-text">Вы уверены, что хотите удалить этот ключ? Это действие нельзя отменить.</p>
            <div className="admin-modal-actions">
              <button className="admin-btn-secondary" onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button className="admin-btn-danger" onClick={() => handleDelete(confirmDelete)}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPage