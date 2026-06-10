import React, { useState, useRef, useEffect } from "react";
import useCaptchaStore from "../store/useCaptchaStore";

const ROLE_COLORS = {
  master: { bg: "#0d419d", text: "#58a6ff" },
  operator: { bg: "#1a3320", text: "#3fb950" },
};

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
      // silently ignore send errors
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getColor = (m) => {
    if (m.sender_role === "master") return { bg: "#0d419d", text: "#58a6ff" };
    if (m.sender_role === "system") return { bg: "#1a1a2e", text: "#8b949e" };
    if (m.sender_role === "operator") {
      const col = (operatorColors || {})[m.sender_label];
      if (col) return { bg: col + "22", text: col };
      return { bg: "#1a3320", text: "#3fb950" };
    }
    return { bg: "#21262d", text: "#8b949e" };
  };

  return (
    <div className="chatbox" style={{
      display: "flex", flexDirection: "column",
      border: "1px solid #30363d", borderRadius: 8,
      background: "#0d1117", overflow: "hidden",
      height: "100%", minHeight: "200px",
    }}>
      <div ref={listRef} style={{
        flex: 1, overflowY: "auto", padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {messages.length === 0 && (
          <div style={{ color: "#484f58", fontSize: "0.75rem", textAlign: "center", padding: 16 }}>
            Нет сообщений
          </div>
        )}
        {messages.map((m, i) => {
          const colors = getColor(m);
          return (
            <div key={i} style={{
              fontSize: "0.75rem", lineHeight: 1.4,
            }}>
              <span style={{ color: colors.text, fontWeight: 600 }}>
                {m.sender_label || m.sender_role}:
              </span>{" "}
              <span style={{ color: "#c9d1d9" }}>{m.message}</span>
            </div>
          );
        })}
      </div>
      <div style={{
        display: "flex", gap: 4, padding: "4px 8px 0",
        borderTop: "1px solid #30363d",
      }}>
        <button
          onClick={() => handleSend("Отошёл")}
          disabled={!ownRole}
          title="Отошёл"
          style={{
            background: ownRole ? "#f8514922" : "#21262d",
            border: "1px solid #f8514944", borderRadius: 4,
            color: "#f85149", fontSize: "0.65rem",
            padding: "3px 6px", cursor: ownRole ? "pointer" : "default",
            whiteSpace: "nowrap",
          }}
        >
          Отошёл
        </button>
        {ownRole === "master" && (
          <button
            onClick={() => handleSend("Все готовы?")}
            disabled={!ownRole}
            title="Все готовы?"
            style={{
              background: ownRole ? "#d2992222" : "#21262d",
              border: "1px solid #d2992244", borderRadius: 4,
              color: "#d29922", fontSize: "0.65rem",
              padding: "3px 6px", cursor: ownRole ? "pointer" : "default",
              whiteSpace: "nowrap",
            }}
          >
            Все готовы?
          </button>
        )}
        <button
          onClick={() => handleSend("Я на месте")}
          disabled={!ownRole}
          title="Я на месте"
          style={{
            background: ownRole ? "#3fb95022" : "#21262d",
            border: "1px solid #3fb95044", borderRadius: 4,
            color: "#3fb950", fontSize: "0.65rem",
            padding: "3px 6px", cursor: ownRole ? "pointer" : "default",
            whiteSpace: "nowrap",
          }}
        >
          Я на месте
        </button>
      </div>
      <div style={{
        display: "flex", gap: 4, padding: "4px 8px 6px",
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение..."
          disabled={!ownRole}
          style={{
            flex: 1, background: "#161b22", border: "1px solid #30363d",
            borderRadius: 4, color: "#c9d1d9", fontSize: "0.75rem",
            padding: "4px 8px", outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!ownRole || !input.trim()}
          style={{
            background: ownRole ? "#238636" : "#21262d",
            border: "none", borderRadius: 4, color: "#fff",
            fontSize: "0.75rem", padding: "4px 10px",
            cursor: ownRole ? "pointer" : "default",
            opacity: ownRole ? 1 : 0.5,
          }}
        >
          Отпр.
        </button>
      </div>
    </div>
  );
}

export default React.memo(ChatBox);
