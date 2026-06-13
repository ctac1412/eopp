import React from "react";
import { Page } from "./Page";

export function SplitPage({ left, right, ...props }) {
  return (
    <Page wide {...props}>
      <div
        data-eopp-component="SplitPage"
        style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 12 }}
      >
        <aside data-eopp-component="SplitPageLeft">{left}</aside>
        <section data-eopp-component="SplitPageRight">{right}</section>
      </div>
    </Page>
  );
}
