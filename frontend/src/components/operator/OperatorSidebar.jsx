import React from "react";
import ChatBox, { getOpColor } from "../ChatBox";
import { ScheduledEvents } from "../ScheduledEvents";

export default function OperatorSidebar({
  connected,
  connectedOpsTags,
  scheduledEvents,
  operatorNickname,
  masterId,
}) {
  if (!connected) return null;

  return (
    <div className="op-sidebar">
      {connectedOpsTags.length > 0 && (
        <div className="op-sidebar__ops-tags">
          {connectedOpsTags.map((op) => {
            const color = getOpColor(op.color_index ?? 0);
            return (
              <span
                key={op.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.7rem",
                  background: color + "22",
                  color: color,
                  border: `1px solid ${color}44`,
                  borderRadius: 8,
                  padding: "1px 8px",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: op.online ? "#3fb950" : "#f85149",
                    boxShadow: op.online
                      ? "0 0 4px #3fb950"
                      : "0 0 4px #f85149",
                  }}
                />
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
        <div className="op-sidebar__scheduled">
          <ScheduledEvents events={scheduledEvents} />
        </div>
      )}
      <div className="op-sidebar__chat-wrap">
        <ChatBox
          ownRole="operator"
          senderLabel={operatorNickname || "Оператор"}
          masterKeyId={masterId}
        />
      </div>
    </div>
  );
}
