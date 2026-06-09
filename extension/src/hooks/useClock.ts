import { useState, useEffect, useRef } from "react";
import { TZ_OFFSET } from "@/constants";

export function useClock() {
  const [time, setTime] = useState(getMSKTime);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    function tick() {
      setTime(getMSKTime());
      timerRef.current = window.setTimeout(tick, 100);
    }
    timerRef.current = window.setTimeout(tick, 100);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return time;
}

function getMSKTime(): string {
  const now = new Date();
  const utcSec =
    now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const mskSec = (utcSec + TZ_OFFSET * 3600) % 86400;
  const h = Math.floor(mskSec / 3600);
  const m = Math.floor((mskSec % 3600) / 60);
  const s = mskSec % 60;
  const d = Math.floor(now.getUTCMilliseconds() / 100);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

export function parseTime(str: string): number | null {
  const parts = str.trim().split(":");
  if (parts.length !== 3) return null;
  const hVal = Number(parts[0].trim());
  const mVal = Number(parts[1].trim());
  const secParts = parts[2].trim().split(".");
  const sVal =
    secParts.length === 2
      ? parseFloat(secParts[0] + "." + secParts[1])
      : Number(secParts[0]);
  if (
    isNaN(hVal) ||
    isNaN(mVal) ||
    isNaN(sVal) ||
    hVal < 0 ||
    hVal > 23 ||
    mVal < 0 ||
    mVal > 59 ||
    sVal < 0 ||
    sVal > 59.9
  )
    return null;
  return hVal * 3600 + mVal * 60 + sVal;
}

export function mskToUtcSeconds(mskSeconds: number): number {
  return (((mskSeconds - TZ_OFFSET * 3600) % 86400) + 86400) % 86400;
}
