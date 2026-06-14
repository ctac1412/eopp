import React from "react";

import { Button, FilterBar, SelectInput, TextInput } from "../../../ui";
import { EDIT_STATE_LABELS, FINANCE_KIND_LABELS } from "./financeFormat.js";

const ALL_OPTION = { value: "", label: "Все" };

export function FinanceFilters({
  filters,
  onChange,
  companies = [],
  showKind = true,
  showEditState = true,
  showPayout = true,
  showStatus = false,
  statusOptions = [],
}) {
  const setField = (field, value) => onChange({ ...filters, [field]: value ?? "" });
  const reset = () => onChange({});
  const companyOptions = [
    ALL_OPTION,
    ...companies.map((company) => ({ value: String(company.id), label: company.name || `#${company.id}` })),
  ];
  const kindOptions = [
    ALL_OPTION,
    ...Object.entries(FINANCE_KIND_LABELS).map(([value, label]) => ({ value, label })),
  ];
  const editOptions = [
    ALL_OPTION,
    ...Object.entries(EDIT_STATE_LABELS).map(([value, label]) => ({ value, label })),
  ];

  return (
    <FilterBar
      className="finance-filters"
      actions={<Button size="small" onClick={reset}>Сбросить</Button>}
    >
      <label className="form-label small mb-0">
        Поиск
        <TextInput
          size="small"
          value={filters.search || ""}
          onChange={(event) => setField("search", event.target.value)}
          placeholder="ID, компания, счёт, комментарий"
          style={{ width: 220 }}
        />
      </label>
      <label className="form-label small mb-0">
        Компания
        <SelectInput
          size="small"
          value={filters.company_id || ""}
          onChange={(value) => setField("company_id", value)}
          options={companyOptions}
          allowClear={false}
          style={{ width: 180 }}
        />
      </label>
      {showKind && (
        <label className="form-label small mb-0">
          Тип
          <SelectInput
            size="small"
            value={filters.kind || ""}
            onChange={(value) => setField("kind", value)}
            options={kindOptions}
            allowClear={false}
            style={{ width: 170 }}
          />
        </label>
      )}
      {showEditState && (
        <label className="form-label small mb-0">
          Состояние
          <SelectInput
            size="small"
            value={filters.edit_state || ""}
            onChange={(value) => setField("edit_state", value)}
            options={editOptions}
            allowClear={false}
            style={{ width: 132 }}
          />
        </label>
      )}
      {showStatus && (
        <label className="form-label small mb-0">
          Статус
          <SelectInput
            size="small"
            value={filters.status || ""}
            onChange={(value) => setField("status", value)}
            options={[ALL_OPTION, ...statusOptions]}
            allowClear={false}
            style={{ width: 132 }}
          />
        </label>
      )}
      <label className="form-label small mb-0">
        Счёт
        <TextInput
          size="small"
          value={filters.invoice_id || ""}
          onChange={(event) => setField("invoice_id", event.target.value)}
          inputMode="numeric"
          style={{ width: 96 }}
        />
      </label>
      {showPayout && (
        <label className="form-label small mb-0">
          Выплата
          <TextInput
            size="small"
            value={filters.payout_id || ""}
            onChange={(event) => setField("payout_id", event.target.value)}
            inputMode="numeric"
            style={{ width: 96 }}
          />
        </label>
      )}
      <label className="form-label small mb-0">
        Usage
        <TextInput
          size="small"
          value={filters.usage_log_id || ""}
          onChange={(event) => setField("usage_log_id", event.target.value)}
          inputMode="numeric"
          style={{ width: 96 }}
        />
      </label>
    </FilterBar>
  );
}
