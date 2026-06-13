import React from "react";
import Clock from "../Clock";
import { Button } from "../../ui";

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
  const selectedMaster = masters.find((master) => Number(master.id) === Number(masterId));
  const masterLabel = selectedMaster?.label || (masterId ? `Мастер #${masterId}` : "Мастер не назначен");

  return (
    <div data-eopp-component="OperatorHeader" className="op-header">
      {/* в”Ђв”Ђ Р»РµРІР°СЏ С‡Р°СЃС‚СЊ в”Ђв”Ђ */}
      <div className="op-header__main">
        {/* С‚РѕС‡РєР° РјР°СЃС‚РµСЂР° */}
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

        {/* РЅРёРєРЅРµР№Рј + СЃС‚Р°С‚СѓСЃ РєР°РїС‡Рё */}
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

        {/* Р±РµР№РґР¶ РѕС‡РµСЂРµРґРё */}
        {queueLen > 1 && (
          <span className="op-header__queue-badge">
            +{queueLen - 1}
          </span>
        )}

        {/* Р±РµР№РґР¶ fellow operators */}
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

        {/* Р±РµР№РґР¶ СЂРµР¶РёРјР° РёРєРѕРЅРѕРє */}
        {iconDisplayMode && (
          <span
            className={`op-header__mode-badge ${iconDisplayMode === "own_only" ? "is-own" : "is-all"}`}
          >
            {iconDisplayMode === "own_only"
              ? "Только свои"
              : "Свои+чужие"}
          </span>
        )}

        {/* СЃСЃС‹Р»РєР° РЅР° С‚СЂРµРЅРёСЂРѕРІРєСѓ */}
        <a
          href={`/training?op=${encodeURIComponent(uuid)}`}
          className="op-header__training-link"
        >
          Тренировка
        </a>

        <Clock />
      </div>

      {/* в”Ђв”Ђ РїСЂР°РІР°СЏ С‡Р°СЃС‚СЊ в”Ђв”Ђ */}
      <div className="op-header__controls">
        <span
          data-eopp-component="OperatorAssignedMaster"
          className="op-header__master-static"
          title={masterLabel}
        >
          {masterLabel}
        </span>


        {/* Р±РµР№РґР¶ solvedCount / assigned */}
        <span
          className={`op-header__progress-badge ${active?.complete ? "is-complete" : active?.waiting ? "is-waiting" : ""}`}
        >
          {active?.complete
            ? "Решено"
            : active?.waiting
              ? "Пауза"
              : active
                ? `${active.solvedCount}/${active.assigned.length}`
                : "-"}
        </span>

        {/* РєРЅРѕРїРєР° РїРµСЂРµРїРѕРґРєР»СЋС‡РµРЅРёСЏ */}
        <Button
          data-eopp-component="OperatorReconnectButton"
          className="op-header__action-btn"
          size="small"
          onClick={handleReconnect}
          title="Переподключиться"
        >
          ↻
        </Button>

        {/* РєРЅРѕРїРєР° РѕС‚РєР»СЋС‡РµРЅРёСЏ */}
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
