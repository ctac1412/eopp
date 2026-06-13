import React, { useMemo, useState } from "react";
import { Alert, Card, Space } from "antd";
import { formatMoney } from "../../utils/format";
import { UsageHistory } from "./AdminUsageHistory";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../ui";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  });
}

function keySearchText(key) {
  const tariff = key.tariff || {};
  const debt = key.debt || {};
  return [
    key.id,
    key.label,
    key.key,
    key.comment,
    key.user_name,
    key.company_name,
    key.created_at,
    tariff.price_create,
    tariff.price_reschedule,
    tariff.price_create_peak,
    tariff.price_custom_slots,
    debt.unpaid_total,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasDebt(key) {
  const debt = key.debt || {};
  return (debt.unpaid_count || 0) > 0 || (debt.no_price_count || 0) > 0 || (debt.unpaid_total || 0) > 0;
}

function MoneyCell({ value, tone = "" }) {
  return <span className={`font-monospace text-nowrap ${tone}`}>{value != null ? formatMoney(value) : "—"}</span>;
}

export function ApiKeysTab({
  keys,
  loading,
  error,
  newKey,
  expandedHistory,
  historyLoading,
  historyHideTest,
  expandedLogs,
  expandedConfig,
  onEditKey,
  onToggleActive,
  onToggleHistory,
  onFetchUsageHistory,
  onDeleteUsage,
  onEditUsageLog,
  onTogglePluginLogs,
  onToggleConfig,
  onCloseNewKey,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [debtFilter, setDebtFilter] = useState("all");

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    return keys.filter((key) => {
      if (q && !keySearchText(key).includes(q)) return false;
      if (statusFilter === "active" && !key.active) return false;
      if (statusFilter === "inactive" && key.active) return false;
      if (clientFilter === "external" && !key.is_external) return false;
      if (clientFilter === "internal" && key.is_external) return false;
      if (debtFilter === "debt" && !hasDebt(key)) return false;
      if (debtFilter === "clean" && hasDebt(key)) return false;
      return true;
    });
  }, [clientFilter, debtFilter, keys, search, statusFilter]);

  const metrics = useMemo(() => {
    const active = keys.filter((key) => key.active).length;
    const external = keys.filter((key) => key.is_external).length;
    const debtKeys = keys.filter(hasDebt);
    const unpaidTotal = keys.reduce((sum, key) => sum + Number(key.debt?.unpaid_total || 0), 0);
    const usage = keys.reduce((sum, key) => sum + Number(key.usage_count || 0), 0);
    return [
      { key: "visible", label: "Ключи", value: `${filteredKeys.length} / ${keys.length}`, tone: filteredKeys.length === keys.length ? "neutral" : "warning" },
      { key: "active", label: "Активные", value: active, tone: active > 0 ? "success" : "neutral" },
      { key: "external", label: "Внешние", value: external, tone: external > 0 ? "warning" : "neutral" },
      { key: "usage", label: "Использований", value: usage, tone: "info" },
      { key: "debt", label: "С долгом", value: debtKeys.length, tone: debtKeys.length > 0 ? "warning" : "success" },
      { key: "unpaid", label: "Долг", value: formatMoney(unpaidTotal), tone: unpaidTotal > 0 ? "danger" : "success" },
    ];
  }, [filteredKeys.length, keys]);

  const expandedRowKeys = useMemo(
    () => Object.keys(expandedHistory || {}).map((id) => Number(id)),
    [expandedHistory],
  );

  const columns = [
    {
      title: "Ключ",
      width: 210,
      ellipsis: true,
      render: (_, key) => (
        <div className="api-key-title-cell">
          <span className="fw-semibold" title={key.label || "—"}>{key.label || "—"}</span>
          <span>
            <span className="text-muted">#{key.id} · </span>
            <Button
              data-eopp-component="ApiKeyCopyTokenButton"
              size="small"
              className="api-key-token-button"
              onClick={() => copyToClipboard(key.key)}
              title="Скопировать ключ"
            >
              ...{key.key?.slice(-4) || "—"}
            </Button>
          </span>
        </div>
      ),
    },
    { title: "Создан", dataIndex: "created_at", width: 118, render: formatDate },
    {
      title: "Владелец",
      width: 150,
      ellipsis: true,
      render: (_, key) => (
        <div className="api-key-stack-cell">
          <span title={key.user_name || "—"}>{key.user_name || "—"}</span>
          <span className="text-muted" title={key.company_name || ""}>{key.company_name || ""}</span>
        </div>
      ),
    },
    { title: "Комментарий", dataIndex: "comment", ellipsis: true, render: (value) => <span title={value || "—"}>{value || "—"}</span> },
    {
      title: "Тарифы",
      width: 150,
      align: "right",
      render: (_, key) => {
        const tariff = key.tariff;
        return (
          <div className="api-key-stack-cell">
            <span><span className="text-muted">Б</span> <MoneyCell value={tariff?.price_create} /></span>
            <span><span className="text-muted">П</span> <MoneyCell value={tariff?.price_reschedule} /></span>
          </div>
        );
      },
    },
    {
      title: "Доп.",
      width: 136,
      align: "right",
      render: (_, key) => {
        const tariff = key.tariff;
        return (
          <div className="api-key-stack-cell">
            <span><span className="text-muted">12</span> <MoneyCell value={tariff?.price_create_peak} /></span>
            <span><span className="text-muted">Св</span> <MoneyCell value={tariff?.price_custom_slots} /></span>
          </div>
        );
      },
    },
    {
      title: "Исп.",
      width: 86,
      align: "center",
      render: (_, key) => `${key.usage_count ?? 0}${key.max_uses != null ? ` / ${key.max_uses}` : ""}`,
    },
    {
      title: "Долг",
      width: 96,
      align: "center",
      render: (_, key) => {
        const debt = key.debt || { unpaid_count: 0, no_price_count: 0, unpaid_total: 0 };
        return hasDebt(key) ? (
          <StatusTag
            status="warning"
            label={formatMoney(debt.unpaid_total || 0)}
            color="warning"
          />
        ) : (
          <StatusTag status="confirmed" label={formatMoney(0)} />
        );
      },
    },
    {
      title: "Флаги",
      width: 96,
      align: "center",
      render: (_, key) => (
        <Space size={4} wrap>
          <StatusTag status={key.active ? "online" : "offline"} label={key.active ? "Актив" : "Выкл"} />
          {key.is_external ? <StatusTag status="warning" label="Внеш." /> : null}
        </Space>
      ),
    },
    {
      title: "",
      width: 176,
      align: "right",
      render: (_, key) => {
        const isExpanded = expandedHistory[key.id] !== undefined;
        return (
          <Space size={4} wrap>
            <Button size="small" onClick={() => onEditKey(key)}>Изм.</Button>
            <Button size="small" onClick={() => onToggleActive(key)}>{key.active ? "Выкл" : "Вкл"}</Button>
            <Button size="small" variant={isExpanded ? "primary" : "secondary"} onClick={() => onToggleHistory(key.id)}>
              {isExpanded ? "Скрыть" : "Журнал"}
            </Button>
          </Space>
        );
      },
    },
  ];

  const renderHistory = (key) => {
    const historyData = expandedHistory[key.id];
    return (
      <div data-eopp-component="ApiKeyUsageHistoryPanel" className="api-key-history-panel">
        <UsageHistory
          keyId={key.id}
          historyData={historyData}
          isLoading={historyLoading[key.id]}
          isEmpty={historyData === null}
          isError={historyData === null}
          hideTest={historyHideTest[key.id]}
          onToggleHideTest={() => {
            const next = !historyHideTest[key.id];
            onFetchUsageHistory(key.id, next);
          }}
          onRefresh={() => onFetchUsageHistory(key.id, historyHideTest[key.id])}
          onDelete={(usageId) => onDeleteUsage(key.id, usageId)}
          onEdit={(entry) => onEditUsageLog(entry)}
          expandedLogs={expandedLogs}
          expandedConfig={expandedConfig}
          onToggleLogs={(id) => onTogglePluginLogs(id)}
          onToggleConfig={(id) => onToggleConfig(id)}
          editingPriceId={editingPriceId}
          setEditingPriceId={setEditingPriceId}
          onPriceChange={onPriceChange}
          onTogglePaid={onTogglePaid}
        />
      </div>
    );
  };

  if (loading && keys.length === 0) {
    return <div data-eopp-component="ApiKeysTabLoading" className="text-center text-muted py-3">Загрузка…</div>;
  }

  return (
    <div data-eopp-component="ApiKeysTab" className="api-keys-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">API Keys</h2>
            <div className="small text-muted">Ключи доступа, тарифы, лимиты, долги и быстрый переход в журнал</div>
          </div>
        }
      />

      {error ? <Alert className="mb-3" type="error" showIcon message="Ошибка" description={error} /> : null}

      {newKey && (
        <Alert
          className="mb-3"
          type="success"
          showIcon
          message="Ключ создан"
          description={
            <div data-eopp-component="ApiKeyCreatedAlert" className="api-key-created-alert">
              <span>Этот ключ отображается только один раз. Скопируйте и сохраните.</span>
              <TextInput readOnly value={newKey.key} className="font-monospace" />
              <Space size={6}>
                <Button size="small" onClick={() => copyToClipboard(newKey.key)}>Копировать</Button>
                <Button size="small" onClick={onCloseNewKey}>Закрыть</Button>
              </Space>
            </div>
          }
        />
      )}

      <MetricsStrip items={metrics} />

      <Card data-eopp-component="ApiKeysListCard" className="mt-3" size="small" title="Список ключей">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 api-keys-search">
            Поиск
            <TextInput
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="label, комментарий, ID, последние символы ключа"
            />
          </label>
          <label className="form-label small mb-0">
            Статус
            <SelectInput
              size="small"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "active", label: "Активные" },
                { value: "inactive", label: "Выключенные" },
              ]}
              allowClear={false}
            />
          </label>
          <label className="form-label small mb-0">
            Клиент
            <SelectInput
              size="small"
              value={clientFilter}
              onChange={(value) => setClientFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "internal", label: "Внутренние" },
                { value: "external", label: "Внешние" },
              ]}
              allowClear={false}
            />
          </label>
          <label className="form-label small mb-0">
            Долг
            <SelectInput
              size="small"
              value={debtFilter}
              onChange={(value) => setDebtFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "debt", label: "Есть долг" },
                { value: "clean", label: "Без долга" },
              ]}
              allowClear={false}
            />
          </label>
        </FilterBar>

        <DataTable
          className="api-keys-table"
          rowKey="id"
          data={filteredKeys}
          columns={columns}
          loading={loading}
          emptyText="Нет ключей"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
          scroll={false}
          expandable={{
            expandedRowKeys,
            showExpandColumn: false,
            expandedRowRender: renderHistory,
            rowExpandable: () => true,
          }}
        />
      </Card>
    </div>
  );
}
