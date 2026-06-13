import React from "react";
import { MetricCard } from "./MetricCard";

export function MetricsStrip({ items = [], className = "", ...props }) {
  return (
    <div data-eopp-component="MetricsStrip" className={`eopp-metrics-strip ${className}`.trim()} {...props}>
      {items.map((item) => (
        <MetricCard key={item.key || item.label} {...item} />
      ))}
    </div>
  );
}
