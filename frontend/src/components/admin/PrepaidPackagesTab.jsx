import React, { useMemo, useState } from "react";
import { Card, Modal, Space } from "antd";
import { formatMoney } from "../../utils/format";
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
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function MoneyCell({ value, tone = "" }) {
  return <span className={`font-monospace text-nowrap ${tone}`}>{formatMoney(value || 0)}</span>;
}

export function PrepaidPackagesTab({
  packages,
  deductions,
  keys,
  onCreate,
  onUpdate,
  onDelete,
  onTopUp,
  onRefresh,
}) {
  const [form, setForm] = useState({ api_key_id: "", balance_amount: "", active: true });
  const [topUpPackage, setTopUpPackage] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [packageSearch, setPackageSearch] = useState("");
  const [packageStatusFilter, setPackageStatusFilter] = useState("all");
  const [deductionKeyFilter, setDeductionKeyFilter] = useState("all");
  const [deductionDateFrom, setDeductionDateFrom] = useState("");
  const [deductionDateTo, setDeductionDateTo] = useState("");

  const keyOptions = useMemo(
    () => (keys || []).map((key) => ({ id: key.id, label: key.label || `#${key.id}` })),
    [keys],
  );

  const keyById = useMemo(() => {
    const map = new Map();
    keyOptions.forEach((key) => map.set(key.id, key.label));
    return map;
  }, [keyOptions]);

  const filteredPackages = useMemo(() => {
    const q = normalizeText(packageSearch.trim());
    return packages.filter((pkg) => {
      const keyLabel = keyById.get(pkg.api_key_id) || `#${pkg.api_key_id}`;
      if (packageStatusFilter === "active" && !pkg.active) return false;
      if (packageStatusFilter === "inactive" && pkg.active) return false;
      if (!q) return true;
      return normalizeText([pkg.id, pkg.api_key_id, keyLabel, pkg.balance_amount].join(" ")).includes(q);
    });
  }, [keyById, packageSearch, packageStatusFilter, packages]);

  const filteredDeductions = useMemo(() => {
    const from = deductionDateFrom ? new Date(`${deductionDateFrom}T00:00:00`) : null;
    const to = deductionDateTo ? new Date(`${deductionDateTo}T23:59:59`) : null;
    return deductions.filter((item) => {
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      if (deductionKeyFilter !== "all" && String(item.api_key_id || "") !== deductionKeyFilter) return false;
      if (from && createdAt && createdAt < from) return false;
      if (to && createdAt && createdAt > to) return false;
      return true;
    });
  }, [deductions, deductionKeyFilter, deductionDateFrom, deductionDateTo]);

  const totals = useMemo(() => {
    const active = packages.filter((pkg) => pkg.active);
    const balance = packages.reduce((sum, pkg) => sum + Number(pkg.balance_amount || 0), 0);
    const visibleBalance = filteredPackages.reduce((sum, pkg) => sum + Number(pkg.balance_amount || 0), 0);
    const deducted = filteredDeductions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { active: active.length, balance, visibleBalance, deducted };
  }, [deductions, filteredDeductions, filteredPackages, packages]);

  const metrics = [
    { key: "packages", label: "Пакеты", value: `${filteredPackages.length} / ${packages.length}`, tone: filteredPackages.length === packages.length ? "neutral" : "warning" },
    { key: "active", label: "Активных", value: totals.active, tone: totals.active > 0 ? "success" : "neutral" },
    { key: "balance", label: "Баланс всего", value: formatMoney(totals.balance), tone: "success" },
    { key: "visible", label: "Баланс выборки", value: formatMoney(totals.visibleBalance), tone: "info" },
    { key: "deducted", label: "Списано", value: formatMoney(totals.deducted), tone: totals.deducted > 0 ? "warning" : "neutral" },
    { key: "deductions", label: "Списания", value: `${filteredDeductions.length} / ${deductions.length}`, tone: filteredDeductions.length === deductions.length ? "neutral" : "warning" },
  ];

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.api_key_id) return;
    await onCreate({
      api_key_id: Number(form.api_key_id),
      balance_amount: Number(form.balance_amount || 0),
      active: !!form.active,
    });
    setForm((prev) => ({ ...prev, balance_amount: "" }));
  };

  const submitTopUp = async () => {
    if (!topUpPackage || !topUpAmount) return;
    await onTopUp(topUpPackage.id, Number(topUpAmount));
    setTopUpPackage(null);
    setTopUpAmount("");
  };

  const confirmDelete = (pkg) => {
    Modal.confirm({
      title: "Удалить пакет предоплаты?",
      content: `Пакет #${pkg.id} для ключа ${keyById.get(pkg.api_key_id) || `#${pkg.api_key_id}`} будет удален.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: () => onDelete(pkg.id),
    });
  };

  const packageColumns = [
    { title: "ID", dataIndex: "id", width: 64, render: (value) => <span className="text-muted">#{value}</span> },
    {
      title: "Ключ",
      dataIndex: "api_key_id",
      ellipsis: true,
      render: (value) => <span title={keyById.get(value) || `#${value}`}>{keyById.get(value) || `#${value}`}</span>,
    },
    { title: "Баланс", dataIndex: "balance_amount", width: 120, align: "right", render: (value) => <MoneyCell value={value} tone="text-success" /> },
    { title: "Статус", dataIndex: "active", width: 96, align: "center", render: (value) => <StatusTag status={value ? "confirmed" : "offline"} label={value ? "Активен" : "Выкл"} /> },
    { title: "Обновлен", dataIndex: "updated_at", width: 130, render: formatDate },
    {
      title: "",
      width: 230,
      align: "right",
      render: (_, pkg) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => setTopUpPackage(pkg)}>Пополнить</Button>
          <Button
            size="small"
            onClick={() => onUpdate(pkg.id, { balance_amount: pkg.balance_amount, active: !pkg.active })}
          >
            {pkg.active ? "Выключить" : "Включить"}
          </Button>
          <Button size="small" variant="danger" onClick={() => confirmDelete(pkg)}>Удалить</Button>
        </Space>
      ),
    },
  ];

  const deductionColumns = [
    { title: "ID", dataIndex: "id", width: 64, render: (value) => <span className="text-muted">#{value}</span> },
    { title: "Дата", dataIndex: "created_at", width: 130, render: formatDate },
    { title: "Пакет", dataIndex: "package_id", width: 80, align: "center", render: (value) => `#${value}` },
    { title: "Ключ", dataIndex: "api_key_id", width: 150, ellipsis: true, render: (value, item) => item.key_label || keyById.get(value) || `#${value}` },
    { title: "Лог", dataIndex: "usage_log_id", width: 80, align: "center", render: (value) => `#${value}` },
    { title: "Компания", dataIndex: "company", ellipsis: true, render: (value) => <span title={value || "—"}>{value || "—"}</span> },
    { title: "Сумма", dataIndex: "amount", width: 110, align: "right", render: (value) => <MoneyCell value={value} /> },
  ];

  return (
    <div data-eopp-component="PrepaidPackagesTab" className="prepaid-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Предоплата</h2>
            <div className="small text-muted">Пакеты баланса API-ключей и журнал автоматических списаний</div>
          </div>
        }
        right={<Button size="small" onClick={onRefresh}>Обновить</Button>}
      />

      <MetricsStrip items={metrics} />

      <Card data-eopp-component="PrepaidCreateCard" className="mt-3" size="small" title="Новый пакет">
        <form className="prepaid-create-form" onSubmit={handleCreate}>
          <label className="form-label small mb-0">
            API ключ
            <SelectInput
              size="small"
              value={form.api_key_id}
              onChange={(value) => setForm((prev) => ({ ...prev, api_key_id: value || "" }))}
              options={[
                { value: "", label: "Выбери ключ" },
                ...keyOptions.map((key) => ({ value: String(key.id), label: `${key.label} (#${key.id})` })),
              ]}
              allowClear={false}
            />
          </label>
          <label className="form-label small mb-0">
            Начальный баланс
            <TextInput
              data-eopp-component="PrepaidInitialBalanceInput"
              size="small"
              type="number"
              min="0"
              value={form.balance_amount}
              onChange={(event) => setForm((prev) => ({ ...prev, balance_amount: event.target.value }))}
              required
            />
          </label>
          <label className="form-label small mb-0">
            Активен
            <SelectInput
              size="small"
              value={form.active ? "1" : "0"}
              onChange={(value) => setForm((prev) => ({ ...prev, active: value === "1" }))}
              options={[
                { value: "1", label: "Да" },
                { value: "0", label: "Нет" },
              ]}
              allowClear={false}
            />
          </label>
          <Button size="small" variant="primary" htmlType="submit">Добавить пакет</Button>
        </form>
      </Card>

      <Card data-eopp-component="PrepaidPackagesCard" className="mt-3" size="small" title="Пакеты">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 prepaid-search">
            Поиск
            <TextInput size="small" value={packageSearch} onChange={(event) => setPackageSearch(event.target.value)} placeholder="ключ, ID, баланс" />
          </label>
          <label className="form-label small mb-0">
            Статус
            <SelectInput
              size="small"
              value={packageStatusFilter}
              onChange={(value) => setPackageStatusFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "active", label: "Активные" },
                { value: "inactive", label: "Выключенные" },
              ]}
              allowClear={false}
            />
          </label>
        </FilterBar>
        <DataTable
          className="prepaid-packages-table"
          rowKey="id"
          data={filteredPackages}
          columns={packageColumns}
          emptyText="Нет пакетов"
          pagination={{ pageSize: 12, showSizeChanger: true, pageSizeOptions: [10, 12, 25, 50] }}
          scroll={false}
        />
      </Card>

      <Card data-eopp-component="PrepaidDeductionsCard" className="mt-3" size="small" title="Журнал списаний">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0">
            Ключ
            <SelectInput
              size="small"
              value={deductionKeyFilter}
              onChange={(value) => setDeductionKeyFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                ...keyOptions.map((key) => ({ value: String(key.id), label: `${key.label} (#${key.id})` })),
              ]}
              allowClear={false}
              style={{ minWidth: 180 }}
            />
          </label>
          <label className="form-label small mb-0">
            С даты
            <TextInput data-eopp-component="PrepaidDeductionsDateFrom" size="small" type="date" value={deductionDateFrom} onChange={(event) => setDeductionDateFrom(event.target.value)} />
          </label>
          <label className="form-label small mb-0">
            По дату
            <TextInput data-eopp-component="PrepaidDeductionsDateTo" size="small" type="date" value={deductionDateTo} onChange={(event) => setDeductionDateTo(event.target.value)} />
          </label>
        </FilterBar>
        <DataTable
          className="prepaid-deductions-table"
          rowKey="id"
          data={filteredDeductions}
          columns={deductionColumns}
          emptyText="Списаний пока нет"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
          scroll={false}
        />
      </Card>

      <Modal
        title={topUpPackage ? `Пополнение предоплаты #${topUpPackage.id}` : "Пополнение предоплаты"}
        open={!!topUpPackage}
        onCancel={() => setTopUpPackage(null)}
        onOk={submitTopUp}
        okText="Пополнить"
        cancelText="Отмена"
        destroyOnClose
      >
        <label className="form-label small mb-0 w-100">
          Сумма пополнения
          <TextInput
            data-eopp-component="PrepaidTopUpAmountInput"
            type="number"
            min="1"
            value={topUpAmount}
            onChange={(event) => setTopUpAmount(event.target.value)}
            autoFocus
            required
          />
        </label>
      </Modal>
    </div>
  );
}
