import React from "react";
import { Checkbox, InputNumber } from "antd";
import { formatMoney } from "../../utils/format";
import { Button, DataTable, StatusTag } from "../../ui";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function opTypeLabel(opType) {
  if (opType === "create") return "Создание";
  if (opType === "reschedule") return "Перенос";
  return null;
}

function maskFio(fio) {
  if (!fio || typeof fio !== "string") return "—";
  const parts = fio.trim().split(/\s+/);
  if (parts.length === 0) return "—";
  const first = parts[0];
  const masked = first.length >= 3 ? first.slice(0, 3) : first;
  if (parts.length >= 2) {
    const second = parts[1];
    if (parts.length >= 3) {
      const third = parts[2];
      return `${masked} ${second[0]}. ${third[0]}.`;
    }
    return `${masked} ${second[0]}.`;
  }
  return masked;
}

function isTestRecord(record) {
  return record.is_test === true || record.is_test === 1;
}

function statusLabel(status) {
  if (status === "confirmed") return "Подтв.";
  if (status === "pending") return "Ожид.";
  return "Ошибка";
}

function getPriceTone(record) {
  if (record.price == null || record.price <= 0) return "text-muted";
  if (record.paid === true) return "text-success fw-semibold";
  if (record.paid === false) return "text-danger fw-semibold";
  return "";
}

const COLUMN_CONFIGS = {
  checkbox: { header: "", width: 42 },
  id: { header: "ID", width: 70 },
  type: { header: "Тип", width: 100 },
  time: { header: "Время", width: 118 },
  status: { header: "Статус", width: 96 },
  slot: { header: "Дата слота", width: 104 },
  fio: { header: "ФИО", width: 90 },
  test: { header: "Тестовая", width: 82 },
  custom_slots: { header: "Свои слоты", width: 92 },
  price: { header: "Цена", width: 100 },
  paid: { header: "Оплата", width: 82 },
  error: { header: "Ошибка", width: 180 },
  actions: { header: "Действия", width: 170 },
  resid: { header: "ID брони", width: 150 },
  captcha: { header: "Капча", width: 150 },
};

const PRESETS = {
  user: {
    columns: ["id", "type", "time", "status", "custom_slots", "slot", "resid", "captcha", "paid", "error", "actions"],
    actions: { showLogs: true, showConfig: true, showEdit: false, showDelete: false, showCheckbox: false },
  },
  admin: {
    columns: ["checkbox", "id", "type", "time", "status", "slot", "fio", "custom_slots", "test", "price", "paid", "error", "actions"],
    actions: { showLogs: true, showConfig: true, showEdit: true, showDelete: true, showCheckbox: true },
  },
};

function DetailBlock({ title, children }) {
  return (
    <section className="history-detail-block">
      <div className="history-detail-block__title">{title}</div>
      <pre>{children}</pre>
    </section>
  );
}

function HistoryDetails({ record, showConfig, showLogs }) {
  const hasLogs = record.logs && record.logs.length > 0;
  return (
    <div data-eopp-component="HistoryDetails" className="history-details">
      {showConfig && record.config_json != null && (
        <DetailBlock title="Config">
          {JSON.stringify(record.config_json, null, 2)}
        </DetailBlock>
      )}
      {showLogs && (
        <DetailBlock title="Логи">
          {hasLogs ? record.logs.join("\n") : "Нет логов"}
        </DetailBlock>
      )}
    </div>
  );
}

export function HistoryRow() {
  return null;
}

export function HistoryTable({
  records,
  preset = "user",
  columns,
  actions,
  expandedLogs = {},
  expandedConfig = {},
  expandedErrors = {},
  selectedLogs = {},
  onToggleLogs,
  onToggleConfig,
  onToggleError,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  onEdit,
  onDelete,
  onRowClick,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
  onGenerateInvoice,
}) {
  const resolvedColumns = columns || PRESETS[preset].columns;
  const resolvedActions = { ...PRESETS[preset].actions, ...actions };
  const selectedCount = Object.values(selectedLogs).filter(Boolean).length;

  const tableColumns = resolvedColumns.map((columnKey) => {
    const config = COLUMN_CONFIGS[columnKey] || { header: "" };
    const base = {
      title: config.header,
      key: columnKey,
      width: config.width,
      ellipsis: ["resid", "captcha", "error"].includes(columnKey),
    };

    if (columnKey === "checkbox") {
      return {
        ...base,
        title: onToggleSelectAll ? (
          <Checkbox
            data-eopp-component="HistorySelectAll"
            checked={!!allSelected}
            onChange={(event) => onToggleSelectAll(event.target.checked)}
          />
        ) : "",
        align: "center",
        render: (_, record) => (
          <Checkbox
            data-eopp-component="HistorySelectRow"
            checked={!!selectedLogs[record.id]}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleSelect?.(record.id)}
          />
        ),
      };
    }

    if (columnKey === "id") {
      return {
        ...base,
        render: (_, record) => <span className="font-monospace">{record.id}</span>,
      };
    }

    if (columnKey === "type") {
      return {
        ...base,
        align: "center",
        render: (_, record) => {
          const label = opTypeLabel(record.op_type);
          if (!label) return "—";
          return <StatusTag status={record.op_type === "create" ? "create" : "reschedule"} label={label} />;
        },
      };
    }

    if (columnKey === "time") {
      return { ...base, render: (_, record) => <span className="text-nowrap">{formatDate(record.created_at)}</span> };
    }

    if (columnKey === "status") {
      return {
        ...base,
        align: "center",
        render: (_, record) => <StatusTag status={record.status} label={statusLabel(record.status)} />,
      };
    }

    if (columnKey === "slot") {
      return { ...base, render: (_, record) => record.slot_date || "—" };
    }

    if (columnKey === "fio") {
      return { ...base, render: (_, record) => maskFio(record.fio) };
    }

    if (columnKey === "test") {
      return { ...base, align: "center", render: (_, record) => (isTestRecord(record) ? "Да" : "Нет") };
    }

    if (columnKey === "custom_slots") {
      return { ...base, align: "center", render: (_, record) => (record.has_custom_slots ? "Да" : "—") };
    }

    if (columnKey === "resid") {
      return {
        ...base,
        render: (_, record) => <span className="font-monospace" title={record.reservation_id || "—"}>{record.reservation_id || "—"}</span>,
      };
    }

    if (columnKey === "captcha") {
      return {
        ...base,
        render: (_, record) => <span className="font-monospace" title={record.captcha_id || "—"}>{record.captcha_id || "—"}</span>,
      };
    }

    if (columnKey === "price") {
      return {
        ...base,
        align: "right",
        render: (_, record) => {
          if (editingPriceId === record.id && resolvedActions.showEdit) {
            return (
              <InputNumber
                data-eopp-component="HistoryPriceInput"
                size="small"
                min={0}
                defaultValue={record.price ?? 0}
                autoFocus
                onBlur={(event) => {
                  const value = event.target.value === "" ? 0 : parseInt(event.target.value, 10);
                  onPriceChange?.(record.id, value);
                  setEditingPriceId?.(null);
                }}
                onPressEnter={(event) => {
                  const value = event.target.value === "" ? 0 : parseInt(event.target.value, 10);
                  onPriceChange?.(record.id, value);
                  setEditingPriceId?.(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditingPriceId?.(null);
                }}
                onClick={(event) => event.stopPropagation()}
                className="history-price-input"
              />
            );
          }
          return (
            <span
              className={getPriceTone(record)}
              onDoubleClick={resolvedActions.showEdit ? (event) => {
                event.stopPropagation();
                setEditingPriceId?.(record.id);
              } : undefined}
              title={resolvedActions.showEdit ? "Двойной клик для редактирования" : undefined}
            >
              {record.price != null ? formatMoney(record.price) : "—"}
            </span>
          );
        },
      };
    }

    if (columnKey === "paid") {
      return {
        ...base,
        align: "center",
        render: (_, record) => {
          const isPaid = record.paid === true;
          const hasInvoice = !!record.invoice_id;
          const paidTitle = isPaid ? "Оплачено" : (!hasInvoice ? "Нет счета" : "Не оплачено");
          return (
            <span
              onDoubleClick={resolvedActions.showEdit ? (event) => {
                event.stopPropagation();
                onTogglePaid?.(record.id);
              } : undefined}
              title={`${paidTitle}${resolvedActions.showEdit ? " (двойной клик для смены)" : ""}`}
            >
              {isPaid ? "Да" : "—"}
            </span>
          );
        },
      };
    }

    if (columnKey === "error") {
      return {
        ...base,
        render: (_, record) => {
          const hasError = record.error_message != null && record.error_message !== "";
          if (!hasError) return "—";
          const isExpanded = expandedErrors?.[record.id];
          const value = isExpanded || record.error_message.length <= 100
            ? record.error_message
            : `${record.error_message.slice(0, 100)}…`;
          return (
            <span
              className="text-danger history-error-text"
              title="Нажмите, чтобы развернуть"
              onClick={(event) => {
                event.stopPropagation();
                onToggleError?.(record.id);
              }}
            >
              {value}
            </span>
          );
        },
      };
    }

    if (columnKey === "actions") {
      return {
        ...base,
        fixed: "right",
        render: (_, record) => {
          const isLogsExpanded = expandedLogs?.[record.id];
          const isConfigExpanded = expandedConfig?.[record.id];
          const hasConfig = record.config_json != null;
          return (
            <div className="history-actions" onClick={(event) => event.stopPropagation()}>
              {resolvedActions.showEdit && (
                <Button size="small" onClick={() => onEdit?.(record)} title="Редактировать">
                  Изм.
                </Button>
              )}
              {resolvedActions.showDelete && (
                <Button size="small" variant="danger" onClick={() => onDelete?.(record.id)} title="Удалить">
                  Удал.
                </Button>
              )}
              {resolvedActions.showLogs && (
                <Button
                  size="small"
                  variant={isLogsExpanded ? "primary" : "secondary"}
                  onClick={() => onToggleLogs?.(record.id)}
                  title={isLogsExpanded ? "Свернуть логи" : "Показать логи"}
                >
                  Логи
                </Button>
              )}
              {resolvedActions.showConfig && hasConfig && (
                <Button
                  size="small"
                  variant={isConfigExpanded ? "primary" : "secondary"}
                  onClick={() => onToggleConfig?.(record.id)}
                  title={isConfigExpanded ? "Свернуть конфиг" : "Показать конфиг"}
                >
                  CFG
                </Button>
              )}
            </div>
          );
        },
      };
    }

    return { ...base, render: () => null };
  });

  const expandedRowKeys = records
    .filter((record) => expandedLogs?.[record.id] || expandedConfig?.[record.id])
    .map((record) => record.id);

  return (
    <div data-eopp-component="HistoryTable" className="history-table">
      {onGenerateInvoice && selectedCount > 0 && (
        <div data-eopp-component="HistoryInvoiceToolbar" className="history-invoice-toolbar">
          <span>Выбрано: {selectedCount}</span>
          <Button size="small" variant="primary" onClick={onGenerateInvoice}>
            Сформировать счет
          </Button>
        </div>
      )}
      <DataTable
        className="history-data-table"
        rowKey="id"
        data={records}
        columns={tableColumns}
        emptyText="Нет записей"
        pagination={false}
        scroll={{ x: "max-content" }}
        onRow={(record) => ({
          onClick: onRowClick ? () => onRowClick(record) : undefined,
          className: onRowClick ? "history-row" : "",
        })}
        expandable={{
          expandedRowKeys,
          showExpandColumn: false,
          expandedRowRender: (record) => (
            <HistoryDetails
              record={record}
              showConfig={!!expandedConfig?.[record.id]}
              showLogs={!!expandedLogs?.[record.id]}
            />
          ),
          rowExpandable: (record) => !!expandedLogs?.[record.id] || !!expandedConfig?.[record.id],
        }}
      />
    </div>
  );
}
