import React from "react";
import { Page } from "./Page";

export function ListPage({
  title,
  subtitle,
  actions,
  metrics,
  analytics,
  filters,
  toolbar,
  children,
}) {
  return (
    <Page
      title={title}
      subtitle={subtitle}
      actions={actions}
      wide
      componentName="ListPage"
    >
      {metrics && (
        <section data-eopp-component="ListPageMetrics" className="eopp-page-section">
          {metrics}
        </section>
      )}
      {analytics && (
        <section data-eopp-component="ListPageAnalytics" className="eopp-page-section">
          {analytics}
        </section>
      )}
      {filters && (
        <section data-eopp-component="ListPageFilters" className="eopp-page-section">
          {filters}
        </section>
      )}
      {toolbar && (
        <section data-eopp-component="ListPageToolbar" className="eopp-page-section">
          {toolbar}
        </section>
      )}
      {children}
    </Page>
  );
}
