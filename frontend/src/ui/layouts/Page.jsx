import React from "react";
import { AppShell } from "./AppShell";
import { PageHeader } from "../components/PageHeader";

export function Page({
  title,
  subtitle,
  actions,
  wide,
  fluid,
  componentName = "Page",
  children,
}) {
  const widthClass = fluid ? "eopp-page--fluid" : wide ? "eopp-page--wide" : "";
  return (
    <AppShell>
      <main data-eopp-component={componentName} className={`eopp-page ${widthClass}`}>
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {children}
      </main>
    </AppShell>
  );
}
