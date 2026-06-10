import React from "react";
import Clock from "../Clock";

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
  return (
    <div className="op-header d-flex justify-content-between align-items-center p-3 border-bottom">
      {/* ── левая часть ── */}
      <div className="d-flex align-items-center gap-2">
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
          <span className="op-header__queue-badge badge">
            +{queueLen - 1}
          </span>
        )}

        {/* бейдж fellow operators */}
        {fellowOperators.length > 0 && (
          <span
            className="op-header__fellow-badge badge"
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
            className="badge"
            style={{
              background:
                iconDisplayMode === "own_only" ? "#1a3320" : "#1a2a3a",
              color:
                iconDisplayMode === "own_only" ? "#3fb950" : "#58a6ff",
              fontSize: "0.65rem",
              border: `1px solid ${iconDisplayMode === "own_only" ? "#238636" : "#1f6feb"}`,
            }}
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
      <div className="d-flex align-items-center gap-2">
        {/* селект мастера */}
        <select
          className="op-header__master-select form-select form-select-sm"
          value={masterId || ""}
          onChange={(e) => handleMasterChange(e.target.value)}
        >
          <option value="">Выберите мастера</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || `Мастер #${m.id}`}
            </option>
          ))}
        </select>

        {/* бейдж solvedCount / assigned */}
        <span
          className="badge"
          style={{
            background: active?.complete
              ? "#198754"
              : active?.waiting
                ? "#f59e0b"
                : "#495057",
            fontSize: "0.8rem",
          }}
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
        <button
          className="op-header__action-btn btn btn-sm btn-outline-secondary"
          onClick={handleReconnect}
          title="Переподключиться"
        >
          ↻
        </button>

        {/* кнопка отключения */}
        <button
          className="op-header__action-btn btn btn-sm btn-outline-danger"
          onClick={handleDisconnect}
          title="Отключиться"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
