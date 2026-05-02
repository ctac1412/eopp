import React, { useEffect, useState } from 'react';
import type { InjectorConfig } from '@/types';
import { useInjectorStore } from '@/store';
import { getServerUrl } from '@/api/background';
import { FACILITIES, getDefaultSlotDate } from '@/constants';

const MOCK_ENDPOINTS: { path: string; label: string; extraModes: MockMode[] }[] = [
  { path: '/reservations-api/v1/timeslot/AvailableSlots', label: 'GET /AvailableSlots', extraModes: ['all_occupied'] },
  { path: '/reservations-api/v1/captcha', label: 'POST /captcha', extraModes: [] },
  { path: '/reservations-api/v1/captcha-validate', label: 'POST /captcha-validate', extraModes: [] },
  { path: '/reservations-api/v1/Reschedule', label: 'POST /Reschedule', extraModes: ['all_slots_occupied'] },
  { path: '/reservations-api/v1/SubmitDraft', label: 'POST /SubmitDraft', extraModes: ['all_slots_occupied'] },
];

const MODE_LABELS: Record<string, string> = {
  success: 'Success (default)',
  '429': '429 Rate Limit',
  '400': '400 Bad Request',
  all_occupied: 'All slots occupied',
  all_slots_occupied: 'AllSlotsOccupiedOnInterval',
};

type MockMode = 'success' | '429' | '400' | 'all_occupied' | 'all_slots_occupied';

interface MockEndpointConfig {
  mode: MockMode;
}

interface MockEndpointConfigNew {
  responses: MockMode[];
}

const ENDPOINT_LABELS: Record<keyof InjectorConfig['retryPerEndpoint'], string> = {
  getAvailableSlots: 'Получение слотов',
  generateCaptcha: 'Генерация капчи',
  validateCaptcha: 'Валидация капчи',
  submitReschedule: 'Перезапись (Reschedule)',
  submitCreate: 'Создание (SubmitDraft)',
};

const ENDPOINT_SECTIONS: Record<keyof InjectorConfig['retryPerEndpoint'], 'retryGetAvailableSlots' | 'retryGenerateCaptcha' | 'retryValidateCaptcha' | 'retrySubmitReschedule' | 'retrySubmitCreate'> = {
  getAvailableSlots: 'retryGetAvailableSlots',
  generateCaptcha: 'retryGenerateCaptcha',
  validateCaptcha: 'retryValidateCaptcha',
  submitReschedule: 'retrySubmitReschedule',
  submitCreate: 'retrySubmitCreate',
};

const RetryEndpointRow = React.memo(function RetryEndpointRow({ endpoint }: { endpoint: keyof InjectorConfig['retryPerEndpoint'] }) {
  const config = useInjectorStore((s) => s.config);
  const updateRetryEndpoint = useInjectorStore((s) => s.updateRetryEndpoint);
  const collapsed = useInjectorStore((s) => s.collapsedSections);
  const toggleSection = useInjectorStore((s) => s.toggleSection);
  const sectionKey = ENDPOINT_SECTIONS[endpoint];
  const rc = config.retryPerEndpoint[endpoint];
  const isSlots = endpoint === 'getAvailableSlots';

  return (
    <div className="injector-form-section">
      <h3
        className="injector-section-title injector-collapsible"
        onClick={() => toggleSection(sectionKey)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span className="injector-collapse-icon">{collapsed[sectionKey] ? '▶' : '▼'}</span>{' '}
        Ретрай: {ENDPOINT_LABELS[endpoint]}
      </h3>
      {!collapsed[sectionKey] && (
        <>
          <label className="injector-form-label injector-checkbox-label">
            <input
              type="checkbox"
              checked={rc.enabled}
              onChange={(e) => updateRetryEndpoint(endpoint, 'enabled', e.target.checked)}
            />
            Ретрай 429 — включён
          </label>
          <div className="injector-form-row">
            <label className="injector-form-label">
              Макс. попыток
              <input
                className="injector-form-input injector-form-number"
                type="number"
                min={0}
                value={rc.maxRetries}
                onChange={(e) => updateRetryEndpoint(endpoint, 'maxRetries', Number(e.target.value))}
                disabled={!rc.enabled}
              />
            </label>
            <label className="injector-form-label">
              Задержка (мс)
              <input
                className="injector-form-input injector-form-number"
                type="number"
                min={0}
                value={rc.delayMs}
                onChange={(e) => updateRetryEndpoint(endpoint, 'delayMs', Number(e.target.value))}
                disabled={!rc.enabled}
              />
            </label>
          </div>
          {isSlots && (
            <>
              <label className="injector-form-label injector-checkbox-label">
                <input
                  type="checkbox"
                  checked={rc.retry400Enabled}
                  onChange={(e) => updateRetryEndpoint(endpoint, 'retry400Enabled', e.target.checked)}
                />
                Ретрай 400 — включён
              </label>
              <div className="injector-form-row">
                <label className="injector-form-label">
                  Макс. попыток
                  <input
                    className="injector-form-input injector-form-number"
                    type="number"
                    min={0}
                    value={rc.retry400MaxRetries}
                    onChange={(e) => updateRetryEndpoint(endpoint, 'retry400MaxRetries', Number(e.target.value))}
                    disabled={!rc.retry400Enabled}
                  />
                </label>
                <label className="injector-form-label">
                  Задержка (мс)
                  <input
                    className="injector-form-input injector-form-number"
                    type="number"
                    min={0}
                    value={rc.retry400DelayMs}
                    onChange={(e) => updateRetryEndpoint(endpoint, 'retry400DelayMs', Number(e.target.value))}
                    disabled={!rc.retry400Enabled}
                  />
                </label>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
});

const ConfigForm = React.memo(function ConfigForm() {
  const config = useInjectorStore((s) => s.config);
  const updateField = useInjectorStore((s) => s.updateField);
  const collapsed = useInjectorStore((s) => s.collapsedSections);
  const toggleSection = useInjectorStore((s) => s.toggleSection);
  const [mockConfig, setMockConfig] = useState<Record<string, MockMode[]>>({});
  const [mockLoading, setMockLoading] = useState(false);
  const [mockSending, setMockSending] = useState(false);

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  function handleChange<K extends keyof InjectorConfig>(key: K, value: InjectorConfig[K]) {
    updateField(key, value);
  }

  useEffect(() => {
    const savedMode = localStorage.getItem('injector_last_mode');
    if (savedMode && savedMode !== config.mode) {
      handleChange('slotDate', getDefaultSlotDate(config.mode));
    }
    localStorage.setItem('injector_last_mode', config.mode);
  }, [config.mode]);

  // Load mock config on mount (localhost only)
  useEffect(() => {
    if (!isLocalhost) return;
    setMockLoading(true);
    const serverUrl = getServerUrl();
    fetch(`${serverUrl}/mock-config`, { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        const parsed: Record<string, MockMode[]> = {};
        if (data.endpoints) {
          for (const [path, cfg] of Object.entries(data.endpoints)) {
            const cfgObj = cfg as MockEndpointConfigNew;
            if (cfgObj.responses && cfgObj.responses.length > 0) {
              parsed[path] = cfgObj.responses;
            } else {
              parsed[path] = ['success'];
            }
          }
        }
        setMockConfig(parsed);
      })
      .catch(() => {
        setMockConfig({});
      })
      .finally(() => {
        setMockLoading(false);
      });
  }, [isLocalhost]);

  const updateMockMode = (endpointPath: string, attemptIndex: number, mode: MockMode) => {
    setMockConfig((prev) => {
      const current = prev[endpointPath] || ['success'];
      const updated = [...current];
      updated[attemptIndex] = mode;
      return { ...prev, [endpointPath]: updated };
    });
  };

  const addMockAttempt = (endpointPath: string) => {
    setMockConfig((prev) => {
      const current = prev[endpointPath] || ['success'];
      return { ...prev, [endpointPath]: [...current, 'success'] };
    });
  };

  const removeMockAttempt = (endpointPath: string, attemptIndex: number) => {
    setMockConfig((prev) => {
      const current = prev[endpointPath] || ['success'];
      if (current.length <= 1) return prev;
      const updated = current.filter((_, i) => i !== attemptIndex);
      return { ...prev, [endpointPath]: updated };
    });
  };

  const sendMockConfig = () => {
    if (!isLocalhost) return;
    setMockSending(true);
    const serverUrl = getServerUrl();
    const endpoints: Record<string, MockEndpointConfigNew> = {};
    for (const [path, responses] of Object.entries(mockConfig)) {
      if (responses.length > 0 && !responses.every((m) => m === 'success')) {
        endpoints[path] = { responses };
      }
    }
    fetch(`${serverUrl}/mock-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoints }),
    })
      .then((r) => r.json())
      .then(() => {
        console.log('[ConfigForm] Mock config sent:', endpoints);
      })
      .catch((err) => {
        console.error('[ConfigForm] Failed to send mock config:', err);
      })
      .finally(() => {
        setMockSending(false);
      });
  };

  const resetMockConfig = () => {
    if (!isLocalhost) return;
    setMockSending(true);
    const serverUrl = getServerUrl();
    fetch(`${serverUrl}/mock-config`, {
      method: 'DELETE',
    })
      .then(() => {
        setMockConfig({});
      })
      .catch(() => {})
      .finally(() => {
        setMockSending(false);
      });
  };

  return (
    <div className="injector-config-form">
      <div className="injector-form-section injector-fullscreen-wide" style={{ gridColumn: '1 / -1' }}>
        <h3 className="injector-section-title">Общие настройки</h3>
        <div className="injector-form-row injector-form-row-3">
          <label className="injector-form-label">
            Режим
            <select
              id="mode-select"
              className="injector-form-input"
              value={config.mode}
              onChange={(e) => handleChange('mode', e.target.value as InjectorConfig['mode'])}
            >
              <option value="reschedule">Перенос брони</option>
              <option value="create">Создание брони</option>
            </select>
          </label>
          <label className="injector-form-label">
            Остановиться на этапе
            <select
              id="runUpTo-select"
              className="injector-form-input"
              value={config.runUpTo}
              onChange={(e) => handleChange('runUpTo', Number(e.target.value))}
            >
              <option value="1">1 — слоты</option>
              <option value="2">2 — капча</option>
              <option value="3">3 — решение капчи</option>
              <option value="4">4 — валидация</option>
              <option value="5">5 — отправка</option>
            </select>
          </label>
          <label className="injector-form-label injector-checkbox-label">
            <input
              id="autoSolve-checkbox"
              type="checkbox"
              checked={config.autoSolve}
              onChange={(e) => handleChange('autoSolve', e.target.checked)}
            />
            Авто-решение капчи
          </label>
        </div>
      </div>

      <div className="injector-form-section injector-fullscreen-wide" style={{ gridColumn: '1 / -1' }}>
        <h3 className="injector-section-title">Данные запроса</h3>
        <div className="injector-form-row">
          <label className="injector-form-label">
            ID бронирования
            <span className="injector-form-text injector-form-readonly">{config.reservationId}</span>
          </label>
          <label className="injector-form-label">
            ID транспортного средства
            <input
              id="vehicleId-input"
              className="injector-form-input injector-form-text"
              type="text"
              value={config.vehicleId}
              onChange={(e) => handleChange('vehicleId', e.target.value)}
            />
          </label>
        </div>
        <div className="injector-form-row">
          <label className="injector-form-label">
            Вид перевозки
            <select
              id="transportType-select"
              className="injector-form-input"
              value={config.transportType}
              onChange={(e) => handleChange('transportType', Number(e.target.value) as 1 | 2)}
            >
              <option value="1">Экспорт</option>
              <option value="2">Транзит</option>
            </select>
          </label>
          <label className="injector-form-label">
            Пропускной пункт (АПП)
            <select
              id="facilityId-select"
              className="injector-form-input"
              value={config.facilityId}
              onChange={(e) => handleChange('facilityId', e.target.value)}
            >
              {FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="injector-form-row">
          <label className="injector-form-label">
            Дата пропуска
            <input
              id="slotDate-input"
              className="injector-form-input"
              type="date"
              value={config.slotDate}
              onChange={(e) => handleChange('slotDate', e.target.value)}
            />
          </label>
          <label className="injector-form-label">
            Предпочтительное время
            <select
              id="preferredTime-select"
              className="injector-form-input"
              value={config.preferredTime || ''}
              onChange={(e) => handleChange('preferredTime', e.target.value || null)}
            >
              <option value="">Не выбрано (любой слот)</option>
              {Array.from({ length: 24 }, (_, h) => {
                const label = `${String(h).padStart(2, '0')}:00`;
                return <option key={label} value={label}>{label}</option>;
              })}
            </select>
          </label>
        </div>
      </div>

      <div className="injector-form-section">
        <h3
          className="injector-section-title injector-collapsible"
          onClick={() => toggleSection('slotRetry')}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <span className="injector-collapse-icon">{collapsed.slotRetry ? '▶' : '▼'}</span>{' '}
          Повтор при занятых слотах
        </h3>
        {!collapsed.slotRetry && (
          <>
          <label className="injector-form-label injector-checkbox-label">
            <input
              id="retry-slots-enabled"
              type="checkbox"
              checked={config.retryOnAllSlotsOccupied}
              onChange={(e) => handleChange('retryOnAllSlotsOccupied', e.target.checked)}
            />
            Пробовать другой слот при занятости
          </label>
          <div className="injector-form-row">
            <label className="injector-form-label">
              Макс. попыток
              <input
                id="retry-slots-maxRetries"
                className="injector-form-input injector-form-number"
                type="number"
                value={config.maxSlotRetries}
                onChange={(e) => handleChange('maxSlotRetries', Number(e.target.value))}
              />
            </label>
            <label className="injector-form-label">
              Задержка (мс)
              <input
                id="retry-slots-delayMs"
                className="injector-form-input injector-form-number"
                type="number"
                value={config.slotRetryDelayMs}
                onChange={(e) => handleChange('slotRetryDelayMs', Number(e.target.value))}
              />
            </label>
          </div>
          </>
        )}
      </div>

      {(Object.keys(ENDPOINT_LABELS) as Array<keyof InjectorConfig['retryPerEndpoint']>).map((ep) => (
        <RetryEndpointRow key={ep} endpoint={ep} />
      ))}

      <div className="injector-form-section">
        <h3
          className="injector-section-title injector-collapsible"
          onClick={() => toggleSection('retryMode')}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <span className="injector-collapse-icon">{collapsed.retryMode ? '▶' : '▼'}</span>{' '}
          Режим ретраев
        </h3>
        {!collapsed.retryMode && (
          <>
            <div className="injector-form-row" style={{ alignItems: 'center' }}>
              <label className="injector-form-label" style={{ marginBottom: 0 }}>
                <input
                  id="retryMode-sequential"
                  type="radio"
                  name="retryMode"
                  checked={config.retryMode === 'sequential'}
                  onChange={() => handleChange('retryMode', 'sequential')}
                />
                {' '}Последовательный
              </label>
              <label className="injector-form-label" style={{ marginBottom: 0 }}>
                <input
                  id="retryMode-queue"
                  type="radio"
                  name="retryMode"
                  checked={config.retryMode === 'queue'}
                  onChange={() => handleChange('retryMode', 'queue')}
                />
                {' '}Очередь капч
              </label>
            </div>
            {config.retryMode === 'queue' && (
              <div className="injector-form-row">
                <label className="injector-form-label">
                  Размер очереди
                    <input
                      id="retry-queueSize"
                      className="injector-form-input injector-form-number"
                      type="number"
                      min={2}
                      max={3}
                      value={config.queueSize}
                      onChange={(e) => {
                        const v = Math.min(3, Math.max(2, Number(e.target.value)));
                        handleChange('queueSize', v);
                      }}
                    />
                </label>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mock responses section (localhost only) */}
      {isLocalhost && (
        <div className="injector-form-section injector-fullscreen-wide" style={{ gridColumn: '1 / -1' }}>
          <h3
            className="injector-section-title injector-collapsible"
            onClick={() => toggleSection('mockResponses')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span className="injector-collapse-icon">{collapsed.mockResponses ? '▶' : '▼'}</span>{' '}
            Mock responses
          </h3>
          {!collapsed.mockResponses && (
            <>
              {mockLoading ? (
                <div style={{ padding: '8px', color: '#999' }}>Загрузка...</div>
              ) : (
                <>
                  {MOCK_ENDPOINTS.map((ep) => {
                    const responses = mockConfig[ep.path] || ['success'];
                    return (
                      <div key={ep.path} style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', display: 'flex', justifyContent: 'space', alignItems: 'center' }}>
                          <span>{ep.label}</span>
                          <button
                            onClick={() => addMockAttempt(ep.path)}
                            style={{ fontSize: '10px', background: 'none', border: '1px solid #555', color: '#aaa', cursor: 'pointer', padding: '1px 6px', borderRadius: '3px' }}
                          >
                            + попытка
                          </button>
                        </div>
                        <div className="injector-mock-attempts">
                          {responses.map((mode, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', color: '#666', minWidth: '50px' }}>#{idx + 1}</span>
                              <select
                                id={`mock-${ep.path.replace(/\//g, '-').replace(/^\-/, '')}-attempt-${idx}`}
                                className="injector-form-input"
                                value={mode}
                                onChange={(e) => updateMockMode(ep.path, idx, e.target.value as MockMode)}
                                style={{ minWidth: '140px' }}
                              >
                                <option value="success">{MODE_LABELS.success}</option>
                                <option value="429">{MODE_LABELS['429']}</option>
                                <option value="400">{MODE_LABELS['400']}</option>
                                {ep.extraModes.includes('all_occupied') && (
                                  <option value="all_occupied">{MODE_LABELS.all_occupied}</option>
                                )}
                                {ep.extraModes.includes('all_slots_occupied') && (
                                  <option value="all_slots_occupied">{MODE_LABELS.all_slots_occupied}</option>
                                )}
                              </select>
                              {responses.length > 1 && (
                                <button
                                  onClick={() => removeMockAttempt(ep.path, idx)}
                                  style={{ fontSize: '14px', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '0 4px' }}
                                  title="Удалить попытку"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      className="injector-btn"
                      onClick={sendMockConfig}
                      disabled={mockSending}
                      style={{ flex: 1 }}
                    >
                      {mockSending ? 'Отправка...' : 'Применить'}
                    </button>
                    <button
                      className="injector-btn"
                      onClick={resetMockConfig}
                      disabled={mockSending}
                      style={{ flex: 1 }}
                    >
                      Сбросить
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default ConfigForm;
