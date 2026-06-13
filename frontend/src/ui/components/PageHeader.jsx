import React from "react";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header data-eopp-component="PageHeader" className="eopp-page-header">
      <div>
        {title && <h1 className="eopp-page-header__title">{title}</h1>}
        {subtitle && <div className="eopp-page-header__subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="eopp-toolbar__group">{actions}</div>}
    </header>
  );
}
