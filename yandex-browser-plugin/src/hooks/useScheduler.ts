import { useEffect, useRef, useState } from 'react';
import { useInjectorStore } from '@/store';
import { useInjector } from './useInjector';

function formatCountdown(remaining: number): string {
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const cs = Math.floor((s % 1) * 100);
  const sInt = Math.floor(s);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sInt).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
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

      setCountdown(formatCountdown(remaining));

      timerRef.current = window.setTimeout(tick, 50);
    }

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, scheduleTime, scheduledConfig, cancelSchedule, setConfig, run]);

  return { countdown };
}
