import React from "react";

export function Toolbar({ left, right, children, className = "" }) {
  return (
    <div data-eopp-component="Toolbar" className={`eopp-toolbar ${className}`}>
      <div className="eopp-toolbar__group eopp-toolbar__group--primary">
        {left || children}
      </div>
      {right && <div className="eopp-toolbar__group">{right}</div>}
    </div>
  );
}
