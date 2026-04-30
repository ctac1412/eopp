import React, { useState, useCallback } from 'react';
import { useInjectorStore } from '@/store';
import { parseTime, mskToUtcSeconds } from '@/hooks/useClock';
import { useInjector } from '@/hooks/useInjector';

const Scheduler = React.memo(function Scheduler() {
  const status = useInjectorStore((s) => s.status);
  const startSchedule = useInjectorStore((s) => s.startSchedule);
  const cancelSchedule = useInjectorStore((s) => s.cancelSchedule);
  const config = useInjectorStore((s) => s.config);
  const { run } = useInjector();

  const [timeInput, setTimeInput] = useState('12:00:01');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusClass, setStatusClass] = useState('');

  const handleSchedule = useCallback(() => {
    const mskSeconds = parseTime(timeInput);
    if (mskSeconds === null) {
      setStatusMessage('Неверный формат. Используйте HH:MM:SS');
      setStatusClass('injector-modal-status-error');
      return;
    }
    const targetUtcSeconds = mskToUtcSeconds(mskSeconds);
    startSchedule(targetUtcSeconds, config);
    setStatusMessage('');
    setStatusClass('');
  }, [timeInput, config, startSchedule]);

  const handleCancel = useCallback(() => {
    cancelSchedule();
    setStatusMessage('');
    setStatusClass('');
    setTimeInput('12:00:01');
  }, [cancelSchedule]);

  const handleRun = useCallback(() => {
    cancelSchedule();
    setStatusMessage('');
    setStatusClass('');
    run();
  }, [cancelSchedule, run]);

  const handleNowPlus10 = useCallback(() => {
    const now = new Date();
    const utcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds() + 10;
    const mskSec = (utcSec + 3 * 3600) % 86400;
    const h = Math.floor(mskSec / 3600);
    const m = Math.floor((mskSec % 3600) / 60);
    const s = mskSec % 60;
    setTimeInput(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
  }, []);

  return (
    <div className="injector-schedule-sticky">
      <div className="injector-time-tags">
        <span className="injector-time-tag" onClick={() => setTimeInput('10:00:01')}>10:00</span>
        <span className="injector-time-tag" onClick={() => setTimeInput('12:00:01')}>12:00</span>
        <span className="injector-time-tag injector-time-tag-now" onClick={handleNowPlus10}>Сейчас+10с</span>
      </div>
      <div className="injector-schedule-row">
        <input
          type="text"
          className="injector-schedule-input"
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          maxLength={8}
          placeholder="ЧЧ:ММ:СС МСК"
        />
        <button className="injector-modal-btn injector-modal-btn-cancel" onClick={handleCancel}>Отменить</button>
        <button className="injector-modal-btn injector-modal-btn-schedule" onClick={handleSchedule}>Запланировать</button>
        <button className="injector-modal-btn injector-modal-btn-run" onClick={handleRun}>Запустить сейчас</button>
      </div>
    </div>
  );
});

export default Scheduler;
