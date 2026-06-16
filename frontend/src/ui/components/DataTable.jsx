import React from "react";
import { Alert, Table } from "antd";
import { EmptyState } from "./EmptyState";

export const DATA_TABLE_DEFAULT_PAGE_SIZE = 25;
export const DATA_TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function dataTableShowTotal(total, range) {
  return `${range[0]}-${range[1]} из ${total}`;
}

export function DataTable({
  columns,
  data,
  className = "",
  rowKey = "id",
  loading = false,
  error = null,
  density = "compact",
  sticky = true,
  pagination = false,
  scroll = false,
  emptyText = "Нет записей",
  onRow,
  ...props
}) {
  if (error) {
    return <Alert type="error" showIcon message="Ошибка загрузки" description={error} />;
  }

  const paginationConfig = typeof pagination === "object" ? pagination : {};
  const normalizedPagination = pagination
    ? {
        pageSize: DATA_TABLE_DEFAULT_PAGE_SIZE,
        showSizeChanger: true,
        pageSizeOptions: DATA_TABLE_PAGE_SIZE_OPTIONS,
        showTotal: dataTableShowTotal,
        ...paginationConfig,
        position: paginationConfig.position || ["topRight", "bottomRight"],
      }
    : false;

  const handleRowKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = Array.from(
      event.currentTarget
        .closest("[data-eopp-component='DataTable']")
        ?.querySelectorAll(".ant-table-tbody > tr[data-eopp-row='true']") || [],
    );
    const currentIndex = rows.indexOf(event.currentTarget);
    if (currentIndex < 0) return;

    const nextIndex = event.key === "ArrowDown"
      ? Math.min(rows.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    const nextRow = rows[nextIndex];
    if (!nextRow || nextRow === event.currentTarget) return;

    event.preventDefault();
    nextRow.focus();
    nextRow.click();
  };

  const getRowProps = (record, index) => {
    const rowProps = onRow?.(record, index) || {};
    const originalKeyDown = rowProps.onKeyDown;
    return {
      ...rowProps,
      tabIndex: rowProps.tabIndex ?? 0,
      "data-eopp-row": "true",
      className: ["eopp-data-table__row", rowProps.className].filter(Boolean).join(" "),
      onKeyDown: (event) => {
        originalKeyDown?.(event);
        if (!event.defaultPrevented) handleRowKeyDown(event);
      },
    };
  };

  return (
    <div
      data-eopp-component="DataTable"
      className={`eopp-data-table eopp-data-table--${density} ${className}`}
    >
      <Table
        data-eopp-component="DataTable"
        rowKey={rowKey}
        columns={columns}
        dataSource={data}
        loading={loading}
        size={density === "compact" ? "small" : "middle"}
        sticky={sticky}
        pagination={normalizedPagination}
        locale={{ emptyText: <EmptyState title={emptyText} /> }}
        scroll={scroll === false ? undefined : scroll}
        onRow={getRowProps}
        {...props}
      />
    </div>
  );
}
