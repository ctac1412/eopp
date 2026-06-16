import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Space, Tooltip } from "antd";

import { Button, DataTable, StatusTag, Toolbar } from "../../../ui";
import {
  createFinanceEntry,
  deleteFinanceEntry,
  listFinanceEntries,
  updateFinanceEntry,
} from "./financeApi.js";
import { FinanceEntryModal } from "./FinanceEntryModal.jsx";
import { FinanceFilters } from "./FinanceFilters.jsx";
import {
  editStateLabel,
  financeKindLabel,
  formatDateTime,
  formatMoney,
  matchesFinanceSearch,
} from "./financeFormat.js";

function toServerFilters(filters) {
  const serverFilters = {};
  ["company_id", "usage_log_id", "invoice_id", "payout_id", "kind", "edit_state"].forEach((field) => {
    if (filters[field]) {
      serverFilters[field] = filters[field];
    }
  });
  return serverFilters;
}

function canEditEntry(entry) {
  return entry.edit_state === "open" && !entry.payout_id;
}

function lockReason(entry) {
  if (entry.payout_id) {
    return `Проводка включена в выплату #${entry.payout_id}`;
  }
  if (entry.edit_state !== "open") {
    return `Состояние: ${editStateLabel(entry.edit_state)}`;
  }
  return "";
}

function stateTone(state) {
  if (state === "open") return "pending";
  if (state === "paid") return "paid";
  return "neutral";
}

export function FinanceEntriesView({
  adminToken,
  companies = [],
  participants = [],
  refreshKey,
  onError,
  onRefresh,
  initialFilters,
  onFiltersChange,
}) {
  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState(initialFilters || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalEntry, setModalEntry] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setFilters(initialFilters || {});
  }, [initialFilters]);

  const updateFilters = useCallback(
    (next) => {
      setFilters(next);
      onFiltersChange?.(next);
    },
    [onFiltersChange],
  );

  const loadEntries = useCallback(() => {
    if (!adminToken) {
      return;
    }
    setLoading(true);
    listFinanceEntries(adminToken, toServerFilters(filters))
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch((err) => {
        const message = err?.message || "Не удалось загрузить проводки";
        setError(message);
        onError?.(message);
      })
      .finally(() => setLoading(false));
  }, [adminToken, filters, onError]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshKey]);

  const companyById = useMemo(
    () => new Map(companies.map((company) => [Number(company.id), company.name])),
    [companies],
  );
  const participantById = useMemo(
    () => new Map(participants.map((user) => [Number(user.id), user.name])),
    [participants],
  );

  const enrichedEntries = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        company_name: entry.company_name || companyById.get(Number(entry.company_id)),
        user_name: entry.user_name || participantById.get(Number(entry.user_id)),
      })),
    [companyById, entries, participantById],
  );

  const visibleEntries = useMemo(
    () =>
      enrichedEntries.filter((entry) => {
        if (filters.profit_lot_id && String(entry.profit_lot_id || "") !== String(filters.profit_lot_id)) {
          return false;
        }
        return matchesFinanceSearch(entry, filters.search);
      }),
    [enrichedEntries, filters.profit_lot_id, filters.search],
  );

  const openCreate = () => {
    setModalEntry(null);
    setModalOpen(true);
  };

  const openEdit = (entry) => {
    setModalEntry(entry);
    setModalOpen(true);
  };

  const handleSubmit = async (payload, entry) => {
    try {
      if (entry) {
        await updateFinanceEntry(adminToken, entry.id, payload);
      } else {
        await createFinanceEntry(adminToken, payload);
      }
      setModalOpen(false);
      setModalEntry(null);
      loadEntries();
      onRefresh?.();
    } catch (err) {
      const message = err?.message || "Не удалось сохранить проводку";
      onError?.(message);
    }
  };

  const confirmDelete = (entry) => {
    Modal.confirm({
      title: `Удалить проводку #${entry.id}?`,
      content: "Удалить можно только открытую проводку без выплаты.",
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await deleteFinanceEntry(adminToken, entry.id);
          loadEntries();
          onRefresh?.();
        } catch (err) {
          onError?.(err?.message || "Не удалось удалить проводку");
        }
      },
    });
  };

  const applyRelationFilter = (field, value) => {
    updateFilters({ ...filters, [field]: String(value || "") });
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 64, render: (value) => <span className="text-muted">#{value}</span> },
    { title: "Дата", dataIndex: "created_at", width: 132, render: formatDateTime },
    { title: "Тип", dataIndex: "kind", width: 184, render: (value) => <span className="finance-kind-cell">{financeKindLabel(value)}</span> },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 112,
      align: "right",
      render: (value) => <span className={Number(value) < 0 ? "text-danger font-monospace" : "text-success font-monospace"}>{formatMoney(value)}</span>,
    },
    {
      title: "Состояние",
      dataIndex: "edit_state",
      width: 112,
      align: "center",
      render: (value) => <StatusTag status={stateTone(value)} label={editStateLabel(value)} />,
    },
    { title: "Компания", dataIndex: "company_name", width: 150, ellipsis: true, render: (value, row) => value || row.company_id || "—" },
    {
      title: "Usage",
      dataIndex: "usage_log_id",
      width: 88,
      render: (value) =>
        value ? <Button size="small" onClick={(event) => { event.stopPropagation(); applyRelationFilter("usage_log_id", value); }}>#{value}</Button> : "—",
    },
    {
      title: "Счёт",
      dataIndex: "invoice_id",
      width: 88,
      render: (value) =>
        value ? <Button size="small" onClick={(event) => { event.stopPropagation(); applyRelationFilter("invoice_id", value); }}>#{value}</Button> : "—",
    },
    {
      title: "Выплата",
      dataIndex: "payout_id",
      width: 88,
      render: (value) =>
        value ? <Button size="small" onClick={(event) => { event.stopPropagation(); applyRelationFilter("payout_id", value); }}>#{value}</Button> : "—",
    },
    { title: "Участник", dataIndex: "user_name", width: 140, ellipsis: true, render: (value, row) => value || row.user_id || "—" },
    { title: "Источник", dataIndex: "source", width: 110, ellipsis: true, render: (value) => value || "—" },
    { title: "Комментарий", dataIndex: "comment", width: 220, ellipsis: true, render: (value) => <span title={value || "—"}>{value || "—"}</span> },
    {
      title: "",
      width: 68,
      fixed: "right",
      align: "right",
      render: (_, entry) => {
        const editable = canEditEntry(entry);
        const reason = lockReason(entry);
        return (
          <Space size={4}>
            <Tooltip title={editable ? "Удалить" : reason}>
              <Button size="small" variant="danger" disabled={!editable} onClick={(event) => { event.stopPropagation(); confirmDelete(entry); }}>Удал.</Button>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div data-eopp-component="FinanceEntriesView" className="finance-ledger-view">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Проводки</h2>
            <div className="small text-muted">Показано {visibleEntries.length} из {entries.length}</div>
          </div>
        }
        right={
          <Space wrap>
            <Button size="small" onClick={loadEntries}>Обновить</Button>
            <Button size="small" variant="primary" onClick={openCreate}>Новая корректировка</Button>
          </Space>
        }
      />
      <FinanceFilters filters={filters} onChange={updateFilters} companies={companies} />
      <div className="mt-3">
        <DataTable
          rowKey="id"
          columns={columns}
          data={visibleEntries}
          loading={loading}
          error={error}
          emptyText="Нет проводок"
          pagination
          onRow={(entry) => ({
            onClick: () => canEditEntry(entry) && openEdit(entry),
            className: canEditEntry(entry) ? "finance-table-row" : "finance-table-row finance-table-row--locked",
          })}
        />
      </div>
      <FinanceEntryModal
        open={modalOpen}
        entry={modalEntry}
        companies={companies}
        participants={participants}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
