import React from "react";
import { Alert, Modal, Space, Switch } from "antd";
import { Button, SelectInput, TextInput } from "../../../ui";
import {
  emptyAccess,
  isAccessCompanySelected,
  normalizeAccess,
  removeAccessCompany,
  toggleAccessCompany,
  toggleAccessAll,
  upsertAccessCompany,
} from "./userCompanyAccess";

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super admin" },
  { value: "administrator", label: "Administrator" },
  { value: "manager", label: "Manager" },
  { value: "operator", label: "Operator" },
];

const SYSTEM_ROLE_OPTIONS = [
  { value: "", label: "No system role" },
  { value: "super_admin", label: "Super admin" },
  { value: "administrator", label: "Platform admin" },
  { value: "manager", label: "Platform manager" },
  { value: "operator", label: "Platform operator" },
];

const ACCESS_BLOCKS = [
  ["financeAccess", "Финансы"],
  ["operatorAccess", "Оператор"],
  ["executorAccess", "Исполнитель"],
];

function AccessBlock({ title, value, onChange, companies, canUseGlobalAccess }) {
  const access = normalizeAccess(value);
  const selectedCompanies = companies.filter((company) => isAccessCompanySelected(access, company.id));
  const availableCompanies = companies.filter((company) => !isAccessCompanySelected(access, company.id));
  const onDrop = (event) => {
    event.preventDefault();
    onChange(upsertAccessCompany(access, event.dataTransfer.getData("text/plain")));
  };

  return (
    <div className="user-access-block">
      <div className="user-access-block__head">
        <span className="fw-semibold">{title}</span>
        {canUseGlobalAccess && (
          <button
            type="button"
            className={`operator-master-tag access-tag ${
              access.allCompanies ? "access-tag--selected" : "access-tag--available"
            }`}
            onClick={() => onChange(toggleAccessAll(access, !access.allCompanies))}
          >
            <span className="access-tag__text">Все</span>
          </button>
        )}
      </div>
      <div className="user-access-block__label">Доступные</div>
      <div className="operator-master-tags user-access-block__source">
        {availableCompanies.map((company) => (
          <button
            type="button"
            key={company.id}
            className="operator-master-tag access-tag access-tag--available"
            onClick={() => onChange(upsertAccessCompany(access, company.id))}
          >
            <span
              className="access-tag__drag-icon"
              draggable
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", String(company.id))}
              title="Перетащить"
            />
            <span className="access-tag__text">{company.name}</span>
          </button>
        ))}
        {availableCompanies.length === 0 && <span className="text-muted">Все компании добавлены</span>}
      </div>
      <div className="user-access-block__label">Добавленные</div>
      <div
        className="user-access-block__drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        {access.allCompanies && (
          <button
            type="button"
            className="operator-master-tag access-tag access-tag--selected"
            onClick={() => onChange(toggleAccessAll(access, false))}
          >
            <span className="access-tag__text">Все</span>
          </button>
        )}
        {!access.allCompanies && selectedCompanies.map((company) => (
          <button
            type="button"
            key={company.id}
            className="operator-master-tag access-tag access-tag--selected"
            onClick={() => onChange(removeAccessCompany(access, company.id))}
          >
            <span className="access-tag__text">{company.name}</span>
          </button>
        ))}
        {!access.allCompanies && selectedCompanies.length === 0 && (
          <span className="text-muted">Перетащите сюда или кликните красный тег</span>
        )}
      </div>
    </div>
  );
}

function hasAccess(value) {
  const access = normalizeAccess(value);
  return Boolean(access.allCompanies || access.companyIds?.length);
}

function copyToClipboard(text) {
  if (!text) return;
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

function PersonalApiKeyBlock({
  userId,
  apiKey,
  newApiKey,
  isExecutor,
  onCreate,
  onToggleActive,
  onResetUsage,
  onDelete,
}) {
  const isFreshKey = Number(newApiKey?.user_id) === Number(userId);
  const token = isFreshKey ? newApiKey.key : apiKey?.key;
  return (
    <div className={`user-api-key-block ${isExecutor ? "user-api-key-block--executor" : ""}`}>
      <div className="user-access-block__head">
        <span className="fw-semibold">Персональный ключ</span>
        {isExecutor && <span className="access-tag access-tag--selected">Исполнитель</span>}
      </div>
      {!userId && (
        <div className="text-muted small">Ключ можно выдать после создания пользователя.</div>
      )}
      {userId && isFreshKey && (
        <Alert
          className="mb-2"
          type="success"
          showIcon
          message="Ключ выдан"
          description="Скопируйте токен сейчас. После обновления будет видна только маска."
        />
      )}
      {userId && apiKey && (
        <div className="user-api-key-block__card">
          <div>
            <div className="font-monospace user-api-key-block__token">{token || apiKey.masked_key || apiKey.key}</div>
            <div className="text-muted small">
              {apiKey.active ? "Активен" : "Отключен"} · использований {apiKey.usage_count || 0}
              {apiKey.max_uses != null ? ` / ${apiKey.max_uses}` : ""}
            </div>
          </div>
          <Space size={6} wrap>
            <Button size="small" onClick={() => copyToClipboard(token || apiKey.key)}>Копировать</Button>
            <Button size="small" onClick={() => onResetUsage(apiKey.id)}>Сбросить</Button>
            <Button size="small" onClick={() => onToggleActive(apiKey)}>
              {apiKey.active ? "Отключить" : "Включить"}
            </Button>
            <Button size="small" variant="danger" onClick={() => onDelete(apiKey.id)}>Удалить</Button>
          </Space>
        </div>
      )}
      {userId && !apiKey && (
        <div className="user-api-key-block__empty">
          <span className="text-muted small">Персональный ключ не выдан.</span>
          <Button size="small" variant="primary" onClick={() => onCreate(userId)}>Выдать ключ</Button>
        </div>
      )}
    </div>
  );
}

export function UserModal({
  show,
  form,
  setForm,
  onSubmit,
  onClose,
  companies = [],
  canUseGlobalAccess = false,
  apiKey = null,
  newApiKey = null,
  onCreateApiKey = () => {},
  onToggleApiKey = () => {},
  onResetApiKey = () => {},
  onDeleteApiKey = () => {},
  onStats = null,
}) {
  const handleOk = (event) => {
    event?.preventDefault?.();
    onSubmit(event || { preventDefault() {} });
  };
  const companyOptions = companies.map((company) => ({
    value: String(company.id),
    label: company.name,
  }));
  const setPrimaryCompany = (value) => {
    setForm((prev) => {
      const companyId = value || "";
      return {
        ...prev,
        companyId,
      };
    });
  };

  return (
    <Modal
      data-eopp-component="UserModal"
      className="users-modal users-modal--three-quarter"
      title={form.id ? "Edit user" : "New user"}
      width="75vw"
      open={!!show}
      onOk={handleOk}
      onCancel={onClose}
      okText="Save"
      cancelText="Cancel"
      destroyOnHidden
    >
      <form
        data-eopp-component="UserModalForm"
        className="users-modal-form"
        onSubmit={handleOk}
      >
        {form.id && onStats ? (
          <div className="users-modal-form__toolbar">
            <Button size="small" onClick={() => onStats(form)}>
              {"\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430"}
            </Button>
          </div>
        ) : null}
        <div className="users-modal-form__fields">
          <label className="form-label small mb-0">
            Name
            <TextInput
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="User name"
              required
            />
          </label>
          <label className="form-label small mb-0">
            Login
            <TextInput
              value={form.login || ""}
              onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))}
              placeholder="login"
            />
          </label>
          <label className="form-label small mb-0">
            Password
            <TextInput
              type="password"
              value={form.password || ""}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder={form.id ? "Leave blank to keep current password" : "Password"}
            />
          </label>
          <label className="form-label small mb-0">
            Company role
            <SelectInput
              value={form.role || "manager"}
              onChange={(value) => setForm((prev) => ({ ...prev, role: value || "manager" }))}
              options={ROLE_OPTIONS}
            />
          </label>
          <label className="form-label small mb-0">
            System role
            <SelectInput
              value={form.systemRole || ""}
              onChange={(value) => setForm((prev) => ({ ...prev, systemRole: value || "" }))}
              options={SYSTEM_ROLE_OPTIONS}
            />
          </label>
          <label className="form-label small mb-0">
            Company
            <SelectInput
              value={form.companyId || ""}
              onChange={setPrimaryCompany}
              options={[
                { value: "", label: "No company" },
                ...companyOptions,
              ]}
            />
          </label>
          <div className="users-modal-form__active">
            <span className="users-modal-active-toggle__label">Active</span>
            <Switch
              className="users-modal-active-toggle"
              checked={form.active !== false}
              onChange={(checked) => setForm((prev) => ({ ...prev, active: checked }))}
            />
          </div>
          <div className="users-modal-form__active">
            <span className="users-modal-active-toggle__label">Director</span>
            <Switch
              className="users-modal-active-toggle"
              checked={form.isDirector === true}
              onChange={(checked) => setForm((prev) => ({ ...prev, isDirector: checked }))}
            />
          </div>
          <div className="users-modal-form__active">
            <span className="users-modal-active-toggle__label">Test</span>
            <Switch
              className="users-modal-active-toggle"
              checked={form.isTest === true}
              onChange={(checked) => setForm((prev) => ({ ...prev, isTest: checked }))}
            />
          </div>
        </div>
        <div className="users-modal-form__access">
          <PersonalApiKeyBlock
            userId={form.id}
            apiKey={apiKey}
            newApiKey={newApiKey}
            isExecutor={hasAccess(form.executorAccess)}
            onCreate={onCreateApiKey}
            onToggleActive={onToggleApiKey}
            onResetUsage={onResetApiKey}
            onDelete={onDeleteApiKey}
          />
          {ACCESS_BLOCKS.map(([field, title]) => (
            <AccessBlock
              key={field}
              title={title}
              value={form[field] || emptyAccess()}
              companies={companies}
              canUseGlobalAccess={canUseGlobalAccess}
              onChange={(next) => setForm((prev) => ({ ...prev, [field]: next }))}
            />
          ))}
        </div>
      </form>
    </Modal>
  );
}
