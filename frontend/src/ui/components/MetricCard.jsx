import React from "react";

export function MetricCard({ label, value, tone = "neutral" }) {
  return (
    <div
      data-eopp-component="MetricCard"
      className={`eopp-metric-card eopp-metric-card--${tone}`}
    >
      <div className="eopp-metric-card__label">
        <span className="eopp-metric-card__dot" />
        {label}
      </div>
      <div className="eopp-metric-card__value">{value}</div>
    </div>
  );
}
