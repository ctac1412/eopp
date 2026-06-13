import React from "react";

export function FilterBar({ children, actions, className = "" }) {
  return (
    <div data-eopp-component="FilterBar" className={`eopp-filter-bar ${className}`}>
      <div className="eopp-filter-bar__fields">{children}</div>
      {actions && <div className="eopp-toolbar__group">{actions}</div>}
    </div>
  );
}
