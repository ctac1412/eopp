import React from "react";
import { Card, Skeleton } from "antd";
import { EmptyState } from "../components/EmptyState";

export function ChartCard({ title, loading, empty, children }) {
  return (
    <Card data-eopp-component="ChartCard" title={title} size="small">
      {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : empty ? <EmptyState /> : children}
    </Card>
  );
}
