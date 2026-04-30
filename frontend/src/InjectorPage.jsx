import React, { useState, useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

function getTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function getTomorrowDateTime() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

const DEFAULT_CONFIG = {
  runUpTo: 4,
  facilityId: '1dae5b1c-e2b3-44a4-848f-df8ce2ddde42',
  vehicleId: 'cbce47c1-5d8b-4bc6-ac11-10eea5338b79',
  reservationId: '23cab97f-16c4-4db5-9b87-0a47159b7fb1',
  transportType: 1,
  slotDate: getTomorrowDateTime(),
  mode: 'reschedule',
  preferredTime: '',
  captchaServerUrl: 'https://china.alabai.netcraze.pro',
  autoSolve: true,
  retryOnAllSlotsOccupied: true,
  maxSlotRetries: 5,
  slotRetryDelayMs: 500,
  retryDelayMs: 5000,
  maxRetries: 5,
}

const FACILITIES = [
  { id: '1dae5b1c-e2b3-44a4-848f-df8ce2ddde42', name: 'АПП Забайкальск' },
  { id: '93c9939a-2182-4e78-98b4-0cf314b09cfa', name: 'АПП Тагиркент-Казмаляр' },
  { id: 'cbde069a-7e18-4ca6-9b38-f790348d6c24', name: 'АПП Бугристое' },
  { id: '1fffb312-4ebe-4ad2-a356-0b8f04587c11', name: 'АПП Верхний Ларс' },
  { id: 'ab6edb80-5f8f-4bf9-bf9a-a925271d9df8', name: 'АПП Чернышевское' },
]

const STORAGE_KEY = 'injector-config'

function loadConfigFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG, slotDate: getTomorrowDateTime() }
}

function saveConfigToStorage(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // ignore
  }
}

function buildConfigBlock(config) {
  const preferredTimeVal = config.preferredTime
    ? `'${config.preferredTime}'`
    : 'null'

  const slotDateOnly = config.slotDate ? config.slotDate.slice(0, 10) : ''

  return `const CONFIG = {
  // 1=слоты, 2=капча, 3=решение капчи, 4=валидация, 5=отправка
  runUpTo: ${config.runUpTo},

  facilityId: '${config.facilityId}',
  vehicleId: '${config.vehicleId}',
  reservationId: '${config.reservationId}',
  transportType: ${config.transportType},
  slotDate: '${slotDateOnly}',
  mode: '${config.mode}',
  preferredTime: ${preferredTimeVal},

  captchaServerUrl: '${config.captchaServerUrl}',
  autoSolve: ${config.autoSolve},
  retryOnAllSlotsOccupied: ${config.retryOnAllSlotsOccupied},
  maxSlotRetries: ${config.maxSlotRetries},
  slotRetryDelayMs: ${config.slotRetryDelayMs},
  retryDelayMs: ${config.retryDelayMs},
  maxRetries: ${config.maxRetries},
};`
}

function replaceConfigBlock(fullScript, newConfigBlock) {
  const configRegex = /const CONFIG = \{[\s\S]*?\};/
  const replaced = fullScript.replace(configRegex, newConfigBlock)
  if (replaced === fullScript) {
    console.warn('[InjectorPage] CONFIG block not found in script!')
  }
  return replaced
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      try {
        document.execCommand('copy')
      } finally {
        document.body.removeChild(textarea)
      }
    })
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(textarea)
    }
    return Promise.resolve()
  }
}

function InjectorPage() {
  const [searchParams] = useSearchParams()
  const [config, setConfig] = useState(loadConfigFromStorage)
  const [rawScript, setRawScript] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [exported, setExported] = useState(false)

  useEffect(() => {
    const urlConfig = {}
    const facilityId = searchParams.get('facilityId')
    if (facilityId) urlConfig.facilityId = facilityId
    const vehicleId = searchParams.get('vehicleId')
    if (vehicleId) urlConfig.vehicleId = vehicleId
    const reservationId = searchParams.get('reservationId')
    if (reservationId) urlConfig.reservationId = reservationId
    const transportType = searchParams.get('transportType')
    if (transportType) urlConfig.transportType = Number(transportType)
    if (Object.keys(urlConfig).length > 0) {
      setConfig((prev) => ({ ...prev, ...urlConfig }))
    }
  }, [searchParams])

  useEffect(() => {
    saveConfigToStorage(config)
  }, [config])

  useEffect(() => {
    fetch('/injector-script')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!data.script) throw new Error('Empty script response')
        setRawScript(data.script)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[InjectorPage] Failed to load script:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const generatedScript = replaceConfigBlock(rawScript, buildConfigBlock(config))

  const handleChange = useCallback((key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    const freshConfig = { ...DEFAULT_CONFIG, slotDate: getTomorrowDateTime() }
    setConfig(freshConfig)
  }, [])

  const handleCopy = useCallback(() => {
    if (!generatedScript) return
    copyToClipboard(generatedScript)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch((err) => {
        console.error('[InjectorPage] Copy failed:', err)
        alert('Не удалось скопировать. Скопируйте вручную.')
      })
  }, [generatedScript])

  const handleExportSettings = useCallback(() => {
    const { captchaServerUrl, slotDate, ...exportConfig } = config
    exportConfig.slotDate = slotDate ? slotDate.slice(0, 10) : slotDate
    const json = JSON.stringify(exportConfig, null, 2)
    copyToClipboard(json)
      .then(() => {
        setExported(true)
        setTimeout(() => setExported(false), 2000)
      })
      .catch((err) => {
        console.error('[InjectorPage] Export failed:', err)
        alert('Не удалось скопировать. Скопируйте вручную.')
      })
  }, [config])

  return (
    <div className="injector-page">
      <div className="injector-header">
        <h1>Injector Script</h1>
        <Link to="/" className="back-link">← Назад к капчам</Link>
      </div>

      <div className="injector-layout">
        <div className="injector-config">
          <div className="config-header">
            <h2>Конфигурация</h2>
            <div className="config-actions">
              <button className="action-btn copy-btn" onClick={handleCopy} disabled={loading || error || !generatedScript}>
                {copied ? '✓ Скопировано!' : 'Копировать'}
              </button>
              <button className="action-btn export-btn" onClick={handleExportSettings}>
                {exported ? '✓ Скопировано!' : 'Экспорт JSON'}
              </button>
              <button className="action-btn reset-btn" onClick={handleReset}>Сбросить</button>
            </div>
          </div>

          <div className="config-section">
            <h3>Режим</h3>
            <label>
              <select
                value={config.mode}
                onChange={(e) => handleChange('mode', e.target.value)}
              >
                <option value="reschedule">Перенос брони</option>
                <option value="create">Создание брони</option>
              </select>
            </label>
          </div>

          <div className="config-section">
            <h3>Запуск</h3>
            <label>
              Этап запуска (1-5)
              <select
                value={config.runUpTo}
                onChange={(e) => handleChange('runUpTo', Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="config-section">
            <h3>Данные запроса</h3>
            <label>
              АПП
              <select
                value={config.facilityId}
                onChange={(e) => handleChange('facilityId', e.target.value)}
              >
                {FACILITIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              vehicleId
              <input
                type="text"
                value={config.vehicleId}
                onChange={(e) => handleChange('vehicleId', e.target.value)}
              />
            </label>
            <label>
              reservationId
              <input
                type="text"
                value={config.reservationId}
                onChange={(e) => handleChange('reservationId', e.target.value)}
              />
            </label>
            <label>
              Вид международной автомобильной перевозки
              <select
                value={config.transportType}
                onChange={(e) => handleChange('transportType', Number(e.target.value))}
              >
                <option value={1}>Экспорт</option>
                <option value={2}>Транзит</option>
              </select>
            </label>
            <label>
              slotDate
              <input
                type="date"
                value={config.slotDate.slice(0, 10)}
                onChange={(e) => handleChange('slotDate', e.target.value + 'T10:00')}
              />
            </label>
            <label>
              preferredTime (пусто = авто)
              <input
                type="text"
                value={config.preferredTime}
                placeholder="напр. 14:30"
                onChange={(e) => handleChange('preferredTime', e.target.value)}
              />
            </label>
          </div>

          <div className="config-section">
            <h3>Капча</h3>
            <label>
              captchaServerUrl
              <input
                type="text"
                value={config.captchaServerUrl}
                onChange={(e) =>
                  handleChange('captchaServerUrl', e.target.value)
                }
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.autoSolve}
                onChange={(e) => handleChange('autoSolve', e.target.checked)}
              />
              autoSolve
            </label>
          </div>

          <div className="config-section">
            <h3>Ретрай слотов</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.retryOnAllSlotsOccupied}
                onChange={(e) =>
                  handleChange('retryOnAllSlotsOccupied', e.target.checked)
                }
              />
              retryOnAllSlotsOccupied
            </label>
            <label>
              maxSlotRetries
              <input
                type="number"
                value={config.maxSlotRetries}
                onChange={(e) =>
                  handleChange('maxSlotRetries', Number(e.target.value))
                }
              />
            </label>
            <label>
              slotRetryDelayMs
              <input
                type="number"
                value={config.slotRetryDelayMs}
                onChange={(e) =>
                  handleChange('slotRetryDelayMs', Number(e.target.value))
                }
              />
            </label>
          </div>

          <div className="config-section">
            <h3>Ретрай 429</h3>
            <label>
              maxRetries
              <input
                type="number"
                value={config.maxRetries}
                onChange={(e) =>
                  handleChange('maxRetries', Number(e.target.value))
                }
              />
            </label>
            <label>
              retryDelayMs
              <input
                type="number"
                value={config.retryDelayMs}
                onChange={(e) =>
                  handleChange('retryDelayMs', Number(e.target.value))
                }
              />
            </label>
          </div>
        </div>

        <div className="injector-preview">
          <div className="preview-header">
            <h2>Скрипт для копирования</h2>
          </div>
          {loading ? (
            <div className="script-loading">Загрузка скрипта…</div>
          ) : error ? (
            <div className="script-error">Ошибка загрузки: {error}</div>
          ) : (
            <pre className="script-code">{generatedScript}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default InjectorPage
