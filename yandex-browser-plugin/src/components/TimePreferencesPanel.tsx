import React from "react";
import { useInjectorStore } from "@/store";

const ALL_HOURS = Array.from({ length: 24 }, (_, h) =>
  `${String(h).padStart(2, "0")}:00`,
);

const TimePreferencesPanel = React.memo(function TimePreferencesPanel() {
  const config = useInjectorStore((s) => s.config);
  const updateField = useInjectorStore((s) => s.updateField);

  const selectedTimes = new Set(config.preferredTimes);

  const toggleHour = (hour: string) => {
    const newTimes = selectedTimes.has(hour)
      ? config.preferredTimes.filter((t) => t !== hour)
      : [...config.preferredTimes, hour].sort();
    updateField("preferredTimes", newTimes);
  };

  const selectAll = () => {
    updateField("preferredTimes", [...ALL_HOURS]);
  };

  const deselectAll = () => {
    updateField("preferredTimes", []);
  };

  const BEFORE_LUNCH = Array.from({ length: 12 }, (_, h) =>
    `${String(h).padStart(2, "0")}:00`,
  );

  const AFTER_LUNCH = Array.from({ length: 12 }, (_, h) =>
    `${String(h + 12).padStart(2, "0")}:00`,
  );

  const selectBeforeLunch = () => {
    updateField("preferredTimes", [...BEFORE_LUNCH]);
  };

  const selectAfterLunch = () => {
    updateField("preferredTimes", [...AFTER_LUNCH]);
  };

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
      <div className="qn-time-grid">
        {ALL_HOURS.map((hour) => (
          <label key={hour} className="qn-time-checkbox">
            <input
              type="checkbox"
              checked={selectedTimes.has(hour)}
              onChange={() => toggleHour(hour)}
            />
            <span>{hour}</span>
          </label>
        ))}
      </div>
    </div>
  );
});

export default TimePreferencesPanel;
