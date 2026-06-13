/**
 * EOPP Captcha Solver - CaptchaGrid
 */
import React, { useEffect, useState } from "react";
import CaptchaCard from "./CaptchaCard";
import IconClickCaptcha from "./IconClickCaptcha";
import { CaptchaPanelHeader } from "./CaptchaPanelHeader";
import useCaptchaStore from "../store/useCaptchaStore";
import { getCaptchaGridStatus, getIdleCaptchaSkeletonMode } from "./captchaGridState";
import { formatScheduledCountdown, getNextScheduledEvent } from "./scheduledEventsState";

function IconClickIdleSkeleton() {
  return (
    <div className="captcha-idle-click-skeleton" aria-hidden="true">
      <div className="captcha-idle-click-skeleton__image">
        <div className="captcha-idle-click-skeleton__target target-1" />
        <div className="captcha-idle-click-skeleton__target target-2" />
        <div className="captcha-idle-click-skeleton__target target-3" />
      </div>
      <div className="captcha-idle-click-skeleton__icons">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="captcha-idle-click-skeleton__icon" key={index} />
        ))}
      </div>
    </div>
  );
}

function IdleScheduledCountdown() {
  const scheduledEvents = useCaptchaStore((s) => s.scheduledEvents);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const next = getNextScheduledEvent(scheduledEvents, now);
  if (!next) return null;

  const diff = Math.max(0, next.scheduledAt - now);
  const label = next.label || next.description || "Старт";

  return (
    <div className="captcha-idle-schedule">
      <span className="captcha-idle-schedule__label">{label}</span>
      <span className="captcha-idle-schedule__time">{formatScheduledCountdown(diff)}</span>
    </div>
  );
}

function IdleBody() {
  const mode = getIdleCaptchaSkeletonMode();
  return (
    <div className="captcha-panel__body captcha-panel__body--column">
      {mode === "icon-click" && <IconClickIdleSkeleton />}
      <IdleScheduledCountdown />
      <div className="captcha-panel__idle-loader" aria-hidden="true">
        <div className="idle-spinner" />
      </div>
    </div>
  );
}

function CaptchaGrid() {
  const queue = useCaptchaStore((s) => s.queue);
  const unsolved = queue.filter((q) => !q.solved);
  const active = unsolved[0] || null;
  const meta = getCaptchaGridStatus({ active, unsolvedCount: unsolved.length });

  if (!active) {
    return (
      <div className="captcha-panel">
        <CaptchaPanelHeader
          title={meta.title}
          subtitle={meta.subtitle}
          statusLabel="Нет активной"
        />
        <IdleBody />
      </div>
    );
  }

  if (active.captchaType === 1) {
    return <IconClickCaptcha key={active.id} entry={active} />;
  }

  const imgKeys = Object.keys(active.images);
  const top3 = active.top3;

  const ordered = imgKeys.slice().sort((a, b) => {
    const ra = top3.indexOf(a), rb = top3.indexOf(b);
    if (ra >= 0 && rb >= 0) return ra - rb;
    if (ra >= 0) return -1;
    if (rb >= 0) return 1;
    return parseInt(a) - parseInt(b);
  });

  return (
    <div className="captcha-panel">
        <CaptchaPanelHeader
          title={meta.title}
          typeLabel={meta.subtitle}
          statusLabel="Активна"
        createdAt={active.createdAt}
        timeout={active.timeout}
        top3={top3}
      />
      <div className="captcha-panel__body captcha-panel__body--variants">
        <div className="captcha-variants-grid">
          {ordered.map((key) => (
            <div key={active.id + "-" + key}>
              <CaptchaCard entry={active} index={key} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CaptchaGrid;
