import React from "react";
import Clock from "../../captcha/solving/Clock";
import { Button } from "../../../ui";

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
  handleReconnect,
  handleDisconnect,
}) {
  const activeAssignedCount = Array.isArray(active?.assigned)
    ? active.assigned.length
    : 0;
  const activeVariantCount = Array.isArray(active?.variants)
    ? active.variants.length
    : 0;
  const activeProgressText = activeVariantCount
    ? `0/${activeVariantCount}`
    : `${active?.solvedCount || 0}/${activeAssignedCount}`;
  const selectedMaster = masters.find(
    (master) => Number(master.id) === Number(masterId),
  );
  const masterLabel =
    selectedMaster?.label ||
    (masterId ? `Мастер #${masterId}` : "Мастер не назначен");

  return (
    <div data-eopp-component="OperatorHeader" className="op-header">
      {/* Main status area */}
      <div className="op-header__main">
        {/* Master connection dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            background: masterOnline ? "#3fb950" : "#f85149",
            boxShadow: masterOnline ? "0 0 6px #3fb950" : "0 0 6px #f85149",
          }}
          title={masterOnline ? "Мастер онлайн" : "Мастер офлайн"}
        />

        {/* Nickname and captcha status */}
        <span className="op-header__nickname fw-semibold">
          {operatorNickname ? `${operatorNickname} - ` : ""}
          {hasActive
            ? `Капча ${active.captchaId.slice(0, 8)}`
            : active?.complete
              ? "Решено"
              : active?.waiting
                ? "Пауза"
                : masterId
                  ? `Ожидание капчи (мастер ${masterOnline ? "онлайн" : "офлайн"})`
                  : "Ожидание назначения мастера"}
        </span>

        {/* Queue badge */}
        {queueLen > 1 && (
          <span className="op-header__queue-badge">+{queueLen - 1}</span>
        )}

        {/* Fellow operators badge */}
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

        {/* Icon display mode badge */}
        {iconDisplayMode && (
          <span
            className={`op-header__mode-badge ${iconDisplayMode === "own_only" ? "is-own" : "is-all"}`}
          >
            {iconDisplayMode === "own_only" ? "Только свои" : "Свои+чужие"}
          </span>
        )}

        {/* Training link */}
        <a
          href={`/training?op=${encodeURIComponent(uuid)}`}
          className="op-header__training-link"
        >
          Тренировка
        </a>

        <Clock />
      </div>

      {/* Controls area */}
      <div className="op-header__controls">
        <span
          data-eopp-component="OperatorAssignedMaster"
          className="op-header__master-static"
          title={masterLabel}
        >
          {masterLabel}
        </span>

        {/* Progress badge */}
        <span
          className={`op-header__progress-badge ${active?.complete ? "is-complete" : active?.waiting ? "is-waiting" : ""}`}
        >
          {active?.complete
            ? "Решено"
            : active?.waiting
              ? "Пауза"
              : active
                ? activeProgressText
                : "-"}
        </span>

        {/* Reconnect button */}
        <Button
          data-eopp-component="OperatorReconnectButton"
          className="op-header__action-btn"
          size="small"
          onClick={handleReconnect}
          title="Переподключиться"
        >
          ↻
        </Button>

        {/* Disconnect button */}
        <Button
          data-eopp-component="OperatorDisconnectButton"
          className="op-header__action-btn"
          size="small"
          variant="danger"
          onClick={handleDisconnect}
          title="Отключиться"
        >
          ×
        </Button>
      </div>
    </div>
  );
}
