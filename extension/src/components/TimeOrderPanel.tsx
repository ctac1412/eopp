import React, { useCallback, useState } from "react";
import { useInjectorStore } from "@/store";
import type { TimeOrderPreset } from "@/types";

const ALL_HOURS = Array.from({ length: 24 }, (_, h) =>
  `${String(h).padStart(2, "0")}:00`,
);

type DragRow = { type: "row"; index: number };
type DragTag = { type: "tag"; row: number; hour: string };
type DragPool = { type: "pool"; hour: string };
type DragInfo = DragRow | DragTag | DragPool;

const TimeOrderPanel = React.memo(function TimeOrderPanel() {
  const config = useInjectorStore((s) => s.config);
  const updateField = useInjectorStore((s) => s.updateField);
  const presets = useInjectorStore((s) => s.timeOrderPresets);
  const activePresetId = useInjectorStore((s) => s.activePresetId);
  const savePreset = useInjectorStore((s) => s.saveTimeOrderPreset);
  const loadPreset = useInjectorStore((s) => s.loadTimeOrderPreset);
  const deletePreset = useInjectorStore((s) => s.deleteTimeOrderPreset);
  const clearActivePreset = useInjectorStore((s) => s.clearActivePreset);

  const [presetName, setPresetName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const timeOrder: string[][] = config.timeOrder || [[]];
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);

  const usedHours = new Set(timeOrder.flat());
  const availableHours = ALL_HOURS.filter((h) => !usedHours.has(h));

  const setTimeOrder = useCallback(
    (next: string[][]) => {
      updateField("timeOrder", next);
    },
    [updateField],
  );

  const addHourToRow = useCallback(
    (rowIndex: number, hour: string) => {
      const next = timeOrder.map((r, i) =>
        i === rowIndex ? [...r, hour].sort() : r,
      );
      setTimeOrder(next);
    },
    [timeOrder, setTimeOrder],
  );

  const removeHourFromRow = useCallback(
    (rowIndex: number, hour: string) => {
      const next = timeOrder.map((r, i) =>
        i === rowIndex ? r.filter((h) => h !== hour) : r,
      );
      setTimeOrder(next);
    },
    [timeOrder, setTimeOrder],
  );

  const addRow = useCallback(() => {
    setTimeOrder([...timeOrder, []]);
  }, [timeOrder, setTimeOrder]);

  const removeRow = useCallback(
    (rowIndex: number) => {
      if (timeOrder.length <= 1) return;
      const next = timeOrder.filter((_, i) => i !== rowIndex);
      setTimeOrder(next);
    },
    [timeOrder, setTimeOrder],
  );

  const moveRow = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...timeOrder];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      setTimeOrder(next);
    },
    [timeOrder, setTimeOrder],
  );

  const moveTag = useCallback(
    (fromRow: number, hour: string, toRow: number) => {
      if (fromRow === toRow) return;
      const next = timeOrder.map((r, i) => {
        if (i === fromRow) return r.filter((h) => h !== hour);
        if (i === toRow) return [...r, hour].sort();
        return r;
      });
      setTimeOrder(next);
    },
    [timeOrder, setTimeOrder],
  );

  const selectAll = () => {
    setTimeOrder([ALL_HOURS]);
  };

  const deselectAll = () => {
    setTimeOrder([[]]);
  };

  const selectBeforeLunch = () => {
    setTimeOrder([
      Array.from({ length: 12 }, (_, h) => `${String(h).padStart(2, "0")}:00`),
    ]);
  };

  const selectAfterLunch = () => {
    setTimeOrder([
      Array.from({ length: 12 }, (_, h) =>
        `${String(h + 12).padStart(2, "0")}:00`,
      ),
    ]);
  };

  const onRowDragStart = (index: number) => {
    setDragInfo({ type: "row", index });
  };

  const onTagDragStart = (row: number, hour: string) => {
    setDragInfo({ type: "tag", row, hour });
  };

  const onPoolHourDragStart = (hour: string) => {
    setDragInfo({ type: "pool", hour });
  };

  const onDragEnd = () => {
    setDragInfo(null);
    setDragOverRow(null);
  };

  const onRowDragOver = (e: React.DragEvent, rowIndex: number) => {
    e.preventDefault();
    setDragOverRow(rowIndex);
  };

  const onRowDrop = (e: React.DragEvent, rowIndex: number) => {
    e.preventDefault();
    if (!dragInfo) return;

    if (dragInfo.type === "row") {
      moveRow(dragInfo.index, rowIndex);
    } else if (dragInfo.type === "tag") {
      moveTag(dragInfo.row, dragInfo.hour, rowIndex);
    } else if (dragInfo.type === "pool") {
      addHourToRow(rowIndex, dragInfo.hour);
    }

    setDragInfo(null);
    setDragOverRow(null);
  };

  const onPoolDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverRow(-1);
  };

  const onPoolDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragInfo && dragInfo.type === "tag") {
      removeHourFromRow(dragInfo.row, dragInfo.hour);
    }
    // pool -> pool: ничего не делаем (нельзя удалить из пула)
    setDragInfo(null);
    setDragOverRow(null);
  };

  const onTagClick = (hour: string) => {
    const lastRowIndex = timeOrder.length - 1;
    if (lastRowIndex >= 0) {
      addHourToRow(lastRowIndex, hour);
    } else {
      setTimeOrder([[hour]]);
    }
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name);
    setPresetName("");
    setShowSaveInput(false);
  };

  const handleLoadPreset = (id: string) => {
    loadPreset(id);
  };

  const handleDeletePreset = (id: string) => {
    deletePreset(id);
  };

  const allSelected = usedHours.size === 24;
  const noneSelected = usedHours.size === 0;

  return (
    <div className="qn-time-panel">
      <div className="qn-time-header">
        <span className="qn-time-title">Предпочтительное время</span>
        <div className="qn-time-actions">
          <button className="qn-time-btn" onClick={selectBeforeLunch} type="button">
            До обеда
          </button>
          <button className="qn-time-btn" onClick={selectAfterLunch} type="button">
            После обеда
          </button>
          <button className="qn-time-btn" onClick={selectAll} type="button">
            Выбрать все
          </button>
          <button className="qn-time-btn" onClick={deselectAll} type="button">
            Снять все
          </button>
        </div>
      </div>

      <div className="qn-time-mode-row">
        <span className="qn-time-mode-label">Режим:</span>
        <label className="qn-time-mode-radio">
          <input
            type="radio"
            name="preferredMode"
            value="soft"
            checked={config.preferredMode === "soft"}
            onChange={() => updateField("preferredMode", "soft")}
          />
          Любое, если нет выбранного
        </label>
        <label className="qn-time-mode-radio">
          <input
            type="radio"
            name="preferredMode"
            value="strict"
            checked={config.preferredMode === "strict"}
            onChange={() => updateField("preferredMode", "strict")}
          />
          Только выбранное
        </label>
      </div>

      <div className="qn-time-presets-row">
        <span className="qn-time-mode-label">Пресеты:</span>
        <select
          className="qn-time-preset-select"
          value={activePresetId || ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val) {
              handleLoadPreset(val);
            } else {
              clearActivePreset();
            }
          }}
        >
          <option value="">— выбрать пресет —</option>
          {presets.map((p: TimeOrderPreset) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {activePresetId && (
          <button
            className="qn-time-btn qn-time-btn-small"
            onClick={() => handleDeletePreset(activePresetId)}
            type="button"
            title="Удалить пресет"
          >
            Удалить
          </button>
        )}
        <button
          className="qn-time-btn qn-time-btn-small"
          onClick={() => setShowSaveInput(true)}
          type="button"
        >
          Сохранить
        </button>
        {showSaveInput && (
          <span className="qn-time-preset-save-row">
            <input
              className="qn-time-preset-name-input"
              type="text"
              placeholder="Название пресета"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePreset();
                if (e.key === "Escape") {
                  setShowSaveInput(false);
                  setPresetName("");
                }
              }}
              autoFocus
            />
            <button
              className="qn-time-btn qn-time-btn-small"
              onClick={handleSavePreset}
              type="button"
            >
              OK
            </button>
            <button
              className="qn-time-btn qn-time-btn-small"
              onClick={() => {
                setShowSaveInput(false);
                setPresetName("");
              }}
              type="button"
            >
              Отмена
            </button>
          </span>
        )}
      </div>

      <div className="qn-time-order-rows">
        {timeOrder.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`qn-time-order-row${dragOverRow === rowIndex ? " qn-time-order-row-over" : ""}`}
            draggable
            onDragStart={() => onRowDragStart(rowIndex)}
            onDragOver={(e) => onRowDragOver(e, rowIndex)}
            onDrop={(e) => onRowDrop(e, rowIndex)}
            onDragEnd={onDragEnd}
          >
            <div className="qn-time-order-grip" title="Перетащите для изменения приоритета">
              &#x2807;
            </div>
            <span className="qn-time-order-priority">#{rowIndex + 1}</span>
            <div className="qn-time-order-tags">
              {row.length === 0 ? (
                <span className="qn-time-order-empty">
                  Перетащите время сюда или кликните на время из пула
                </span>
              ) : (
                row.map((hour) => (
                  <span
                    key={hour}
                    className="qn-time-order-tag"
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      onTagDragStart(rowIndex, hour);
                    }}
                    onDragEnd={onDragEnd}
                  >
                    {hour}
                    <button
                      className="qn-time-order-tag-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeHourFromRow(rowIndex, hour);
                      }}
                      type="button"
                      title="Удалить"
                    >
                      &times;
                    </button>
                  </span>
                ))
              )}
            </div>
            {timeOrder.length > 1 && (
              <button
                className="qn-time-order-row-remove"
                onClick={() => removeRow(rowIndex)}
                type="button"
                title="Удалить строку"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      <div
        className={`qn-time-order-pool${dragOverRow === -1 ? " qn-time-order-pool-over" : ""}`}
        onDragOver={onPoolDragOver}
        onDrop={onPoolDrop}
      >
        <span className="qn-time-pool-label">
          Доступные ({availableHours.length}):
        </span>
        <div className="qn-time-pool-hours">
          {availableHours.map((hour) => (
            <span
              key={hour}
              className="qn-time-pool-hour"
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                onPoolHourDragStart(hour);
              }}
              onClick={() => onTagClick(hour)}
              title="Перетащите в строку или кликните для добавления"
            >
              {hour}
            </span>
          ))}
          {availableHours.length === 0 && (
            <span className="qn-time-pool-empty">Все времена выбраны</span>
          )}
        </div>
      </div>

      <div className="qn-time-order-footer">
        <button className="qn-time-btn" onClick={addRow} type="button">
          + Добавить строку
        </button>
        {allSelected && (
          <span className="qn-time-order-hint">
            Выбраны все 24 часа — фильтрация отключена
          </span>
        )}
        {noneSelected && (
          <span className="qn-time-order-hint">
            Нет выбранных времён — фильтрация отключена
          </span>
        )}
      </div>
    </div>
  );
});

export default TimeOrderPanel;
