import React from "react";

export function AppShell({ children, className = "" }) {
  return (
    <div data-eopp-component="AppShell" className={`eopp-app-shell ${className}`}>
      {children}
    </div>
  );
}
