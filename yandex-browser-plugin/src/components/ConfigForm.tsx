import React from 'react';
import type { InjectorConfig } from '@/types';
import { useInjectorStore } from '@/store';
import { FACILITIES } from '@/constants';

const ConfigForm = React.memo(function ConfigForm() {
  const config = useInjectorStore((s) => s.config);
  const updateField = useInjectorStore((s) => s.updateField);
  const collapsed = useInjectorStore((s) => s.collapsedSections);
  const toggleSection = useInjectorStore((s) => s.toggleSection);

  function handleChange<K extends keyof InjectorConfig>(key: K, value: InjectorConfig[K]) {
    updateField(key, value);
  }

  return (
    <div className="injector-config-form">
      <div className="injector-form-section" style={{ gridColumn: '1 / -1' }}>
        <h3 className="injector-section-title">Общие настройки</h3>
        <div className="injector-form-row injector-form-row-3">
          <label className="injector-form-label">
            Режим
            <select
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
              type="checkbox"
              checked={config.autoSolve}
              onChange={(e) => handleChange('autoSolve', e.target.checked)}
            />
            Авто-решение капчи
          </label>
        </div>
        <div className="injector-form-row" style={{ gridColumn: '1 / -1' }}>
          <label className="injector-form-label" style={{ gridColumn: '1 / -1' }}>
            API ключ
            <input
              className="injector-form-input injector-form-text"
              type="text"
              placeholder="(необязательно)"
              value={config.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="injector-form-section" style={{ gridColumn: '1 / -1' }}>
        <h3 className="injector-section-title">Данные запроса</h3>
        <div className="injector-form-row">
          <label className="injector-form-label">
            ID бронирования
            <span className="injector-form-text injector-form-readonly">{config.reservationId}</span>
          </label>
          <label className="injector-form-label">
            ID транспортного средства
            <input
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
              className="injector-form-input"
              type="date"
              value={config.slotDate}
              onChange={(e) => handleChange('slotDate', e.target.value)}
            />
          </label>
          <label className="injector-form-label">
            Предпочтительное время
            <select
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
                  className="injector-form-input injector-form-number"
                  type="number"
                  value={config.maxSlotRetries}
                  onChange={(e) => handleChange('maxSlotRetries', Number(e.target.value))}
                />
              </label>
              <label className="injector-form-label">
                Задержка (мс)
                <input
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

      <div className="injector-form-section">
        <h3
          className="injector-section-title injector-collapsible"
          onClick={() => toggleSection('errorRetry')}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <span className="injector-collapse-icon">{collapsed.errorRetry ? '▶' : '▼'}</span>{' '}
          Повтор при ошибке 429
        </h3>
        {!collapsed.errorRetry && (
          <div className="injector-form-row">
            <label className="injector-form-label">
              Макс. попыток
              <input
                className="injector-form-input injector-form-number"
                type="number"
                value={config.maxRetries}
                onChange={(e) => handleChange('maxRetries', Number(e.target.value))}
              />
            </label>
            <label className="injector-form-label">
              Задержка (мс)
              <input
                className="injector-form-input injector-form-number"
                type="number"
                value={config.retryDelayMs}
                onChange={(e) => handleChange('retryDelayMs', Number(e.target.value))}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
});

export default ConfigForm;
