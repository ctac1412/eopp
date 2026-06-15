import React from "react";
import ChatBox from "./ChatBox";
import { HomeOperatorStrip } from "../../captcha/solving/HomeOperatorStrip";
import { HomeScheduledEventsStrip } from "../../captcha/solving/HomeScheduledEventsStrip";

export default function OperatorSidebar({
  connected,
  connectedOpsTags,
  scheduledEvents,
  operatorNickname,
  masterId,
  embedded = false,
}) {
  if (!connected) return null;

  return (
    <div className={`op-sidebar ${embedded ? "op-sidebar--embedded" : ""}`}>
      {connectedOpsTags.length > 0 && (
        <div className="op-sidebar__strip">
          <HomeOperatorStrip operators={connectedOpsTags} />
        </div>
      )}
      {scheduledEvents.length > 0 && (
        <div className="op-sidebar__strip">
          <HomeScheduledEventsStrip events={scheduledEvents} playSoonSound />
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
