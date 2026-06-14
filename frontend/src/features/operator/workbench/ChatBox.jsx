import React, { useEffect, useRef, useState } from "react";
import useCaptchaStore from "../../../store/useCaptchaStore";
import { Button, TextInput } from "../../../ui";

const OP_COLORS = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149", "#a371f7",
  "#79c0ff", "#56d364", "#e3b341", "#ff7b72", "#bc8cff",
];

export function getOpColor(index) {
  return OP_COLORS[Math.abs(index) % OP_COLORS.length];
}

function ChatBox({ ownRole, senderLabel, masterKeyId, operatorColors }) {
  const messages = useCaptchaStore((s) => s.chatMessages);
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (optText) => {
    const text = (typeof optText === "string" ? optText : input).trim();
    if (!text || !ownRole || !masterKeyId) return;
    setInput("");
    try {
      await fetch("/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_role: ownRole,
          sender_id: masterKeyId,
          sender_label: senderLabel || ownRole,
          message: text,
          master_key_id: masterKeyId,
        }),
      });
    } catch {
      // Chat is operational side-channel; captcha solving must not depend on it.
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const getSenderClassName = (message) => {
    if (message.sender_role === "master") return "is-master";
    if (message.sender_role === "operator") {
      return operatorColors?.[message.sender_label] ? "" : "is-operator";
    }
    if (message.sender_role === "admin") return "is-admin";
    if (message.sender_role === "system") return "is-system";
    return "is-unknown";
  };

  return (
    <div className="chatbox">
      <div ref={listRef} className="chatbox__messages">
        {messages.length === 0 && (
          <div className="chatbox__empty">Нет сообщений</div>
        )}
        {messages.map((message, index) => {
          const operatorColor = message.sender_role === "operator"
            ? operatorColors?.[message.sender_label]
            : null;
          return (
            <div className="chatbox__message" key={index}>
              <span
                className={`chatbox__sender ${getSenderClassName(message)}`}
                style={operatorColor ? { color: operatorColor } : undefined}
              >
                {message.sender_label || message.sender_role}:
              </span>{" "}
              <span className="chatbox__text">{message.message}</span>
            </div>
          );
        })}
      </div>

      <div className="chatbox__quick-actions">
        <Button
          size="small"
          onClick={() => handleSend("Отошёл")}
          disabled={!ownRole}
          title="Отошёл"
          className="chatbox__quick-action is-away"
        >
          Отошёл
        </Button>
        {ownRole === "master" && (
          <Button
            size="small"
            onClick={() => handleSend("Все готовы?")}
            disabled={!ownRole}
            title="Все готовы?"
            className="chatbox__quick-action is-ready-check"
          >
            Все готовы?
          </Button>
        )}
        <Button
          size="small"
          onClick={() => handleSend("Я на месте")}
          disabled={!ownRole}
          title="Я на месте"
          className="chatbox__quick-action is-present"
        >
          Я на месте
        </Button>
      </div>

      <div className="chatbox__composer">
        <TextInput
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение..."
          disabled={!ownRole}
          className="chatbox__input"
        />
        <Button
          size="small"
          variant="primary"
          onClick={handleSend}
          disabled={!ownRole || !input.trim()}
          className="chatbox__send"
        >
          Отпр.
        </Button>
      </div>
    </div>
  );
}

export default React.memo(ChatBox);
