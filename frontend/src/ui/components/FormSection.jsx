import React from "react";

export function FormSection({ title, description, children }) {
  return (
    <section data-eopp-component="FormSection" className="eopp-page-section">
      {title && <h2 className="eopp-page-header__title">{title}</h2>}
      {description && <div className="eopp-page-header__subtitle">{description}</div>}
      <div>{children}</div>
    </section>
  );
}
