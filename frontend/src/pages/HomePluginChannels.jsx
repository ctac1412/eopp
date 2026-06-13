import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui";
import {
  ChannelControlShell,
  companyLabel,
  routeLabel,
  userLabel,
} from "./ChannelControlShell";

function shortAge(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `${minutes} мин`;
}

export function HomePluginChannels({ adminToken, masterKeyId, onError }) {
  const [channels, setChannels] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const response = await fetch("/admin/plugin-channel/sessions", {
        headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      const next = Array.isArray(data.sessions) ? data.sessions : [];
      setChannels(next);
      setSelectedId((current) => {
        if (current && next.some((channel) => channel.id === current)) return current;
        return next.find((channel) => !channel.claimed_master_key_id)?.id || next[0]?.id || null;
      });
    } catch (error) {
      onError?.(error.message || "Ошибка загрузки каналов");
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    loadChannels();
    const timer = window.setInterval(loadChannels, 4000);
    const onFocus = () => loadChannels();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadChannels]);

  const visibleChannels = useMemo(
    () => channels.filter((channel) => (
      (channel.status === "open" && !channel.claimed_master_key_id)
      || Number(channel.claimed_master_key_id) === Number(masterKeyId)
    )),
    [channels, masterKeyId],
  );

  const availableChannels = useMemo(
    () => visibleChannels.filter((channel) => channel.status === "open" && !channel.claimed_master_key_id),
    [visibleChannels],
  );

  const myChannels = useMemo(
    () => visibleChannels.filter((channel) => Number(channel.claimed_master_key_id) === Number(masterKeyId)),
    [masterKeyId, visibleChannels],
  );

  const selected = useMemo(
    () => visibleChannels.find((channel) => channel.id === selectedId) || visibleChannels[0] || null,
    [selectedId, visibleChannels],
  );

  const claimChannel = async (channel) => {
    if (!masterKeyId) {
      onError?.("Не найден текущий ключ мастера для взятия канала");
      return;
    }
    try {
      const response = await fetch(`/admin/plugin-channel/sessions/${channel.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
        body: JSON.stringify({ master_key_id: Number(masterKeyId) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      setSelectedId(channel.id);
      await loadChannels();
    } catch (error) {
      onError?.(error.message || "Ошибка взятия канала");
    }
  };

  const releaseChannel = async (channel) => {
    try {
      const response = await fetch(`/admin/plugin-channel/sessions/${channel.id}/release`, {
        method: "POST",
        headers: { "X-Admin-Token": adminToken },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      await loadChannels();
    } catch (error) {
      onError?.(error.message || "Ошибка освобождения канала");
    }
  };

  const sendCommand = async (channel, type, payload = {}) => {
    try {
      const response = await fetch(`/admin/plugin-channel/sessions/${channel.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
        body: JSON.stringify({ type, payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      await loadChannels();
    } catch (error) {
      onError?.(error.message || "Ошибка отправки команды");
    }
  };

  const closeChannel = async (channel) => {
    try {
      const response = await fetch(`/admin/plugin-channel/sessions/${channel.id}/close`, {
        method: "POST",
        headers: { "X-Admin-Token": adminToken },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      await loadChannels();
    } catch (error) {
      onError?.(error.message || "Ошибка закрытия канала");
    }
  };

  if (!adminToken) return null;

  const lead = availableChannels[0] || myChannels[0] || null;

  return (
    <>
      <section data-eopp-component="HomePluginChannels" className="home-channel-widget">
        <div className="home-channel-widget__main">
          <div>
            <strong>Каналы EOPP</strong>
            <span>{availableChannels.length} новых · {myChannels.length} моих</span>
          </div>
          <Button size="small" onClick={() => setOpen(true)} loading={loading}>
            Открыть
          </Button>
        </div>
        {lead ? (
          <button className="home-channel-widget__lead" type="button" onClick={() => { setSelectedId(lead.id); setOpen(true); }}>
            <span>{companyLabel(lead)}</span>
            <span>{userLabel(lead)} · {routeLabel(lead)} · {shortAge(lead.opened_at)}</span>
          </button>
        ) : (
          <div className="home-channel-widget__empty">Нет доступных каналов</div>
        )}
      </section>

      {open && (
        <div className="home-channel-modal" role="dialog" aria-modal="true">
          <div className="home-channel-modal__panel">
            <header>
              <div>
                <strong>Каналы EOPP</strong>
                <span>{visibleChannels.length} доступно в вашей зоне</span>
              </div>
              <Button size="small" onClick={() => setOpen(false)}>Закрыть</Button>
            </header>
            <div className="home-channel-modal__body">
              <aside className="home-channel-list">
                <ChannelList
                  title="Доступные"
                  channels={availableChannels}
                  selectedId={selected?.id}
                  onSelect={setSelectedId}
                  actionLabel="Взять"
                  onAction={claimChannel}
                />
                <ChannelList
                  title="Мои"
                  channels={myChannels}
                  selectedId={selected?.id}
                  onSelect={setSelectedId}
                  actionLabel="Отказаться"
                  onAction={releaseChannel}
                />
              </aside>
              <ChannelControlShell
                channel={selected}
                onClaim={claimChannel}
                onRelease={releaseChannel}
                onSendCommand={sendCommand}
                onCloseChannel={closeChannel}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChannelList({ title, channels, selectedId, onSelect, actionLabel, onAction }) {
  return (
    <section className="home-channel-list-section">
      <div className="home-channel-list-section__title">{title}</div>
      {channels.map((channel) => (
        <div
          key={channel.id}
          className={`home-channel-card ${channel.id === selectedId ? "is-selected" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(channel.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelect(channel.id);
          }}
        >
          <span>{companyLabel(channel)}</span>
          <small>{userLabel(channel)} · {routeLabel(channel)}</small>
          <Button size="small" onClick={(event) => { event.stopPropagation(); onAction(channel); }}>
            {actionLabel}
          </Button>
        </div>
      ))}
      {channels.length === 0 && <div className="home-channel-list-section__empty">Пусто</div>}
    </section>
  );
}
