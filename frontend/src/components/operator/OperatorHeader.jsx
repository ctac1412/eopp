import React from "react";
import Clock from "../Clock";
import { Button, SelectInput } from "../../ui";

export default function OperatorHeader({
  masterOnline,
  masterId,
  masters,
  connected,
  connecting,
  operatorNickname,
  iconDisplayMode,
  fellowOperators,
  queueLen,
  active,
  hasActive,
  uuid,
  handleMasterChange,
  handleReconnect,
  handleDisconnect,
}) {
  const masterOptions = [
    { value: "", label: "Выберите мастера" },
    ...masters.map((master) => ({
      value: String(master.id),
      label: master.label || `Мастер #${master.id}`,
    })),
  ];

  return (
    <div data-eopp-component="OperatorHeader" className="op-header">
      {/* ── левая часть ── */}
      <div className="op-header__main">
        {/* точка мастера */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            background: masterOnline ? "#3fb950" : "#f85149",
            boxShadow: masterOnline
              ? "0 0 6px #3fb950"
              : "0 0 6px #f85149",
          }}
          title={masterOnline ? "Мастер онлайн" : "Мастер офлайн"}
        />

        {/* никнейм + статус капчи */}
        <span className="op-header__nickname fw-semibold">
          {operatorNickname ? `${operatorNickname} — ` : ""}
          {hasActive
            ? `Капча ${active.captchaId.slice(0, 8)}`
            : active?.complete
              ? "Решено"
              : active?.waiting
                ? "Пауза"
                : `Ожидание капчи (мастер ${masterOnline ? "онлайн" : "офлайн"})`}
        </span>

        {/* бейдж очереди */}
        {queueLen > 1 && (
          <span className="op-header__queue-badge">
            +{queueLen - 1}
          </span>
        )}

        {/* бейдж fellow operators */}
        {fellowOperators.length > 0 && (
          <span
            className="op-header__fellow-badge"
            title={fellowOperators
              .map((f) => f.nickname || `#${f.id}`)
              .join(", ")}
          >
            +{fellowOperators.length} оп.
          </span>
        )}

        {/* бейдж режима иконок */}
        {iconDisplayMode && (
          <span
            className={`op-header__mode-badge ${iconDisplayMode === "own_only" ? "is-own" : "is-all"}`}
          >
            {iconDisplayMode === "own_only"
              ? "Только свои"
              : "Свои+чужие"}
          </span>
        )}

        {/* ссылка на тренировку */}
        <a
          href={`/training?op=${encodeURIComponent(uuid)}`}
          className="op-header__training-link"
        >
          🎓
        </a>

        <Clock />
      </div>

      {/* ── правая часть ── */}
      <div className="op-header__controls">
        {/* селект мастера */}
        <SelectInput
          data-eopp-component="OperatorMasterSelect"
          className="op-header__master-select"
          size="small"
          value={masterId ? String(masterId) : ""}
          onChange={(value) => handleMasterChange(value)}
          options={masterOptions}
          allowClear={false}
        />

        {/* бейдж solvedCount / assigned */}
        <span
          className={`op-header__progress-badge ${active?.complete ? "is-complete" : active?.waiting ? "is-waiting" : ""}`}
        >
          {active?.complete
            ? "Решено"
            : active?.waiting
              ? "Пауза"
              : active
                ? `${active.solvedCount}/${active.assigned.length}`
                : "—"}
        </span>

        {/* кнопка переподключения */}
        <Button
          data-eopp-component="OperatorReconnectButton"
          className="op-header__action-btn"
          size="small"
          onClick={handleReconnect}
          title="Переподключиться"
        >
          ↻
        </Button>

        {/* кнопка отключения */}
        <Button
          data-eopp-component="OperatorDisconnectButton"
          className="op-header__action-btn"
          size="small"
          variant="danger"
          onClick={handleDisconnect}
          title="Отключиться"
        >
          ✕
        </Button>
      </div>
    </div>
  );
}
