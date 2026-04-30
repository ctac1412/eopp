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
  const intervalRef = useRef(null)

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

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>API Keys</h1>
        <div className="admin-header-right">
          <button
            className="admin-btn-primary"
            onClick={() => setShowCreate(true)}
          >
            + Новый ключ
          </button>
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

      {error && <div className="admin-error">{error}</div>}

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
                                  {historyData.map((entry) => (
                                    <tr key={entry.id}>
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
                                    </tr>
                                  ))}
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