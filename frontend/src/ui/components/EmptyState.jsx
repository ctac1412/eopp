import React from "react";
import { Empty } from "antd";

export function EmptyState({ title = "Нет данных", description, action }) {
  return (
    <div data-eopp-component="EmptyState" className="eopp-empty-state">
      <Empty description={description || title} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      {action}
    </div>
  );
}
