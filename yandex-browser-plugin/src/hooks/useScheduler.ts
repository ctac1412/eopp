import { useEffect, useRef, useState } from 'react';
import { useInjectorStore } from '@/store';
import { useInjector } from './useInjector';

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
      const currentUtcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();

      if (currentUtcSec === targetTime) {
        if (timerRef.current) clearTimeout(timerRef.current);
        cancelSchedule();
        setConfig(targetConfig);
        run();
        return;
      }

      const remaining = ((targetTime - currentUtcSec + 86400) % 86400 + 86400) % 86400;
      setCountdown(formatCountdown(remaining));

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
