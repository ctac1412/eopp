import React from "react";
import CountdownTimer from "./CountdownTimer";
import Clock from "./Clock";
import { StatusTag } from "../ui";

export function CaptchaPanelHeader({
  title,
  subtitle,
  typeLabel,
  typeColor = "purple",
  statusLabel,
  statusStatus = "neutral",
  createdAt,
  timeout,
  top3 = [],
}) {
  return (
    <div className="captcha-panel__header">
      <div className="captcha-panel__header-main">
        <span className="captcha-panel__title">{title}</span>
        {subtitle && <span className="captcha-panel__subtitle">{subtitle}</span>}
        {typeLabel && (
          <StatusTag color={typeColor} label={typeLabel} style={{ marginInlineEnd: 0 }} />
        )}
      </div>
      <div className="captcha-panel__header-meta">
        <Clock />
        {createdAt && timeout && <CountdownTimer createdAt={createdAt} timeout={timeout} />}
        {statusLabel && (
          <StatusTag status={statusStatus} label={statusLabel} style={{ marginInlineEnd: 0 }} />
        )}
        {top3.map((t, i) => (
          <span className={`rank-badge rank-badge--${i + 1}`} key={`${t}-${i}`}>
            #{i + 1} = {t}
          </span>
        ))}
      </div>
    </div>
  );
}
