import React, { useMemo } from "react";
import CaptchaGrid from "../components/CaptchaGrid";
import LogViewer from "../components/LogViewer";
import ChatBox, { getOpColor } from "../components/ChatBox";
import { ScheduledEvents } from "../components/ScheduledEvents";
import useCaptchaStore from "../store/useCaptchaStore";

export function CaptchaTab() {
  const apiKeyId = useCaptchaStore((s) => s.apiKeyId);
  const apiKeyLabel = useCaptchaStore((s) => s.apiKeyLabel);
  const connectedOperators = useCaptchaStore((s) => s.connectedOperators);
  const scheduledEvents = useCaptchaStore((s) => s.scheduledEvents);

  const operatorColors = useMemo(() => {
    const map = {};
    (connectedOperators || []).forEach((op, idx) => {
      map[op.nickname] = getOpColor(idx);
    });
    return map;
  }, [connectedOperators]);

  return (
    <div className="d-flex" style={{ height: "calc(100vh - 180px)", minHeight: "500px", gap: "8px" }}>
      <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
        <div className="flex-grow-1" style={{ minHeight: 0, overflow: "auto" }}>
          <CaptchaGrid />
        </div>
        <div style={{ flexShrink: 0, maxHeight: "120px", borderTop: "1px solid var(--border)" }}>
          <LogViewer />
        </div>
      </div>
      <div style={{ width: "260px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        {(connectedOperators || []).length > 0 && (
          <div style={{
            padding: "6px 8px", borderBottom: "1px solid #30363d",
            display: "flex", flexWrap: "wrap", gap: 4,
          }}>
            {connectedOperators.map((op, idx) => {
              const color = getOpColor(idx);
              return (
                <span key={op.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: "0.7rem", background: color + "22",
                  color: color, border: `1px solid ${color}44`,
                  borderRadius: 8, padding: "1px 8px",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: op.online ? "#3fb950" : "#f85149",
                    boxShadow: op.online ? "0 0 4px #3fb950" : "0 0 4px #f85149",
                  }} />
                  {op.nickname}
                  {op.assigned_icons && op.assigned_icons.length > 0 && (
                    <span style={{ opacity: 0.6, fontSize: "0.6rem" }}>
                      [{op.assigned_icons.join(",")}]
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
        {scheduledEvents.length > 0 && (
          <div style={{
            padding: "4px 8px", borderBottom: "1px solid #30363d",
          }}>
            <ScheduledEvents events={scheduledEvents} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <ChatBox ownRole="master" senderLabel={apiKeyLabel} masterKeyId={apiKeyId} operatorColors={operatorColors} />
        </div>
      </div>
    </div>
  );
}
