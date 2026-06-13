import React, { useMemo } from "react";
import { buildHomeOperatorTags } from "./homeOperators";

export function HomeOperatorStrip({ operators = [] }) {
  const tags = useMemo(() => buildHomeOperatorTags(operators), [operators]);

  return (
    <div data-eopp-component="HomeOperatorStrip" className="home-operator-strip">
      <span className="home-operator-strip__label">Операторы</span>
      <div className="home-operator-strip__tags">
        {tags.length === 0 ? (
          <span className="home-operator-strip__empty">нет подключённых</span>
        ) : (
          tags.map((operator) => (
            <span
              key={operator.key}
              className={`home-operator-tag ${operator.online ? "is-online" : "is-offline"}`}
              title={operator.assignedIcons.length > 0 ? `Иконки: ${operator.assignedIcons.join(", ")}` : operator.label}
            >
              <span className="home-operator-tag__dot" />
              <span className="home-operator-tag__label">{operator.label}</span>
              {operator.assignedIcons.length > 0 && (
                <span className="home-operator-tag__icons">
                  {operator.assignedIcons.join(",")}
                </span>
              )}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
