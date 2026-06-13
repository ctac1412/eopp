import React from "react";
import { Checkbox, Modal } from "antd";
import { SelectInput, TextInput } from "../../ui";

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

const MASTER_SCOPE_OPTIONS = [
  { value: "own_company", label: "Own company" },
  { value: "all_companies", label: "All companies" },
];

export function UserModal({ show, form, setForm, onSubmit, onClose, companies = [] }) {
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
      const selected = Array.isArray(prev.operatorCompanyIds)
        ? prev.operatorCompanyIds.map(String)
        : [];
      return {
        ...prev,
        companyId,
        operatorCompanyIds: companyId && !selected.includes(companyId)
          ? [companyId, ...selected]
          : selected,
      };
    });
  };

  return (
    <Modal
      data-eopp-component="UserModal"
      title={form.id ? "Edit user" : "New user"}
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
        <Checkbox
          checked={form.active !== false}
          onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
        >
          Active
        </Checkbox>
        <Checkbox
          checked={!!form.masterEnabled}
          disabled={!form.companyId}
          onChange={(event) => setForm((prev) => ({
            ...prev,
            masterEnabled: event.target.checked,
            masterScope: prev.masterScope || "own_company",
          }))}
        >
          Master profile
        </Checkbox>
        {form.masterEnabled && (
          <label className="form-label small mb-0">
            Master scope
            <SelectInput
              value={form.masterScope || "own_company"}
              onChange={(value) => setForm((prev) => ({ ...prev, masterScope: value || "own_company" }))}
              options={MASTER_SCOPE_OPTIONS}
              allowClear={false}
            />
          </label>
        )}
        <Checkbox
          checked={!!form.operatorEnabled}
          disabled={!form.companyId}
          onChange={(event) => setForm((prev) => ({
            ...prev,
            operatorEnabled: event.target.checked,
            operatorCompanyIds: event.target.checked && prev.companyId && !(prev.operatorCompanyIds || []).includes(prev.companyId)
              ? [prev.companyId, ...(prev.operatorCompanyIds || [])]
              : (prev.operatorCompanyIds || []),
          }))}
        >
          Operator profile
        </Checkbox>
        {form.operatorEnabled && (
          <label className="form-label small mb-0">
            Operator companies
            <SelectInput
              mode="multiple"
              value={Array.isArray(form.operatorCompanyIds) ? form.operatorCompanyIds.map(String) : []}
              onChange={(value) => setForm((prev) => ({ ...prev, operatorCompanyIds: value || [] }))}
              options={companyOptions}
              placeholder="Companies this operator can serve"
            />
          </label>
        )}
        <Checkbox
          checked={!!form.financeEnabled}
          disabled={!form.companyId}
          onChange={(event) => setForm((prev) => ({ ...prev, financeEnabled: event.target.checked }))}
        >
          Finance participant
        </Checkbox>
      </form>
    </Modal>
  );
}
