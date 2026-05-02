import { useEffect, useRef, useState } from 'react';
import { useInjectorStore } from '@/store';
import { useInjector } from './useInjector';

function formatCountdown(totalSeconds: number, ms: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const d = Math.floor(ms / 100);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
}

export function useScheduler() {
  const status = useInjectorStore((s) => s.status);
  const scheduleTime = useInjectorStore((s) => s.scheduleTime);
  const scheduledConfig = useInjectorStore((s) => s.scheduledConfig);
  const cancelSchedule = useInjectorStore((s) => s.cancelSchedule);
  const setConfig = useInjectorStore((s) => s.setConfig);
  const { run } = useInjector();
  const timerRef = useRef<number | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'scheduling' || scheduleTime === null || scheduledConfig === null) {
      setCountdown(null);
      return;
    }

    const targetTime = scheduleTime;
    const targetConfig = scheduledConfig;

    function tick() {
      const now = new Date();
      const currentUtcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds() + now.getUTCMilliseconds() / 1000;

      const remaining = ((targetTime - currentUtcSec + 86400) % 86400 + 86400) % 86400;

      if (remaining < 1) {
        if (timerRef.current) clearTimeout(timerRef.current);
        cancelSchedule();
        setConfig(targetConfig);
        run();
        return;
      }

      setCountdown(formatCountdown(remaining, now.getUTCMilliseconds()));

      const msUntilNextSecond = 1000 - now.getUTCMilliseconds();
      timerRef.current = window.setTimeout(tick, msUntilNextSecond);
    }

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, scheduleTime, scheduledConfig, cancelSchedule, setConfig, run]);

  return { countdown };
}
