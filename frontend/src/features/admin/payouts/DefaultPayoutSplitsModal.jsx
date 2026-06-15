import React from "react";
import { InputNumber, Modal } from "antd";
import { Button, DataTable, SelectInput } from "../../../ui";

const emptyUserOption = { value: "", label: "Пользователь" };

export function DefaultPayoutSplitsModal({
  open,
  splits = [],
  users = [],
  saving = false,
  onChange,
  onClose,
  onSubmit,
}) {
  const userOptions = [
    emptyUserOption,
    ...users.map((user) => ({
      value: user.id,
      label: user.name || user.login || `#${user.id}`,
    })),
  ];
  const totalPct = splits.reduce((sum, split) => sum + (Number(split.split_pct) || 0), 0);
  const totalWarning = Math.abs(totalPct - 100) > 0.01 && splits.length > 0;

  const updateSplit = (index, patch) => {
    onChange?.((prev) => {
      const next = [...(prev || [])];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addSplit = () => {
    onChange?.((prev) => [...(prev || []), { user_id: null, split_pct: 0 }]);
  };

  const removeSplit = (index) => {
    onChange?.((prev) => (prev || []).filter((_, splitIndex) => splitIndex !== index));
  };

  const columns = [
    {
      title: "Участник",
      render: (_, split, index) => (
        <SelectInput
          size="small"
          value={split.user_id ?? ""}
          onChange={(value) => updateSplit(index, { user_id: value ? Number(value) : null })}
          options={userOptions}
          allowClear={false}
        />
      ),
    },
    {
      title: "Доля",
      width: 150,
      align: "right",
      render: (_, split, index) => (
        <InputNumber
          data-eopp-component="DefaultPayoutSplitPctInput"
          size="small"
          min={0}
          max={100}
          step={0.01}
          value={split.split_pct}
          onChange={(value) => updateSplit(index, { split_pct: Number(value) || 0 })}
          addonAfter="%"
          status={totalWarning ? "warning" : undefined}
        />
      ),
    },
    {
      title: "",
      width: 90,
      align: "right",
      render: (_, __, index) => (
        <Button size="small" variant="danger" onClick={() => removeSplit(index)}>
          Удалить
        </Button>
      ),
    },
  ];

  return (
    <Modal
      data-eopp-component="DefaultPayoutSplitsModal"
      title="Дефолтные доли прибыли"
      open={open}
      onCancel={onClose}
      width={720}
      destroyOnClose
      footer={[
        <Button key="cancel" size="small" onClick={onClose}>
          Отмена
        </Button>,
        <Button
          key="submit"
          size="small"
          variant="primary"
          loading={saving}
          disabled={totalWarning || splits.length === 0}
          onClick={onSubmit}
        >
          Сохранить
        </Button>,
      ]}
    >
      <div className="payout-modal__section">
        <div className="payout-modal__section-title">
          <span>Доли для новой выплаты</span>
          <Button size="small" variant="primary" onClick={addSplit}>
            Добавить
          </Button>
        </div>
        <DataTable
          className="payout-modal__table"
          rowKey={(_, index) => index}
          data={splits}
          columns={columns}
          emptyText="Добавьте участников"
          pagination={false}
          scroll={false}
        />
        <div className={totalWarning ? "text-warning small mt-2" : "text-muted small mt-2"}>
          Сумма долей: {totalPct.toFixed(1)}%
        </div>
      </div>
    </Modal>
  );
}
