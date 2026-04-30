import { useState, useEffect, useRef } from 'react';
import { TZ_OFFSET } from '@/constants';

export function useClock() {
  const [time, setTime] = useState(getMSKTime);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    function tick() {
      setTime(getMSKTime());
      const msLeft = 1000 - new Date().getUTCMilliseconds();
      timerRef.current = window.setTimeout(tick, msLeft);
    }
    timerRef.current = window.setTimeout(tick, 1000 - new Date().getUTCMilliseconds());
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return time;
}

function getMSKTime(): string {
  const now = new Date();
  const utcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const mskSec = (utcSec + TZ_OFFSET * 3600) % 86400;
  const h = Math.floor(mskSec / 3600);
  const m = Math.floor((mskSec % 3600) / 60);
  const s = mskSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseTime(str: string): number | null {
  const parts = str.trim().split(':');
  if (parts.length !== 3) return null;
  const [h, m, s] = parts.map(Number);
  if (isNaN(h) || isNaN(m) || isNaN(s) || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

export function mskToUtcSeconds(mskSeconds: number): number {
  return ((mskSeconds - TZ_OFFSET * 3600) % 86400 + 86400) % 86400;
}
