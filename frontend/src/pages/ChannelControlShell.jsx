import React from "react";
import { Button, StatusTag } from "../ui";

export function companyLabel(channel) {
  return channel?.company?.name || channel?.raw_company_name || "Без компании";
}

export function userLabel(channel) {
  if (typeof channel?.eopp_user === "string") return channel.eopp_user;
  return channel?.eopp_user?.name || channel?.eopp_user_name || "Пользователь не найден";
}

export function routeLabel(channel) {
  if (channel?.route_kind === "reservation_card") return "карточка";
  if (channel?.route_kind === "eopp_root") return "root";
  return "маршрут ?";
}

function valueOrDash(value) {
  return value || "-";
}

export function ChannelControlShell({
  channel,
  onClaim,
  onRelease,
  onSendCommand,
  onCloseChannel,
}) {
  if (!channel) {
    return (
      <main className="channel-control-shell">
        <div className="channel-control-shell__placeholder">Выберите канал слева</div>
      </main>
    );
  }

  const isClaimed = Boolean(channel.claimed_master_key_id);

  return (
    <main className="channel-control-shell">
      <div className="channel-control-shell__head">
        <div>
          <strong>{companyLabel(channel)}</strong>
          <span>{userLabel(channel)}</span>
        </div>
        <StatusTag status={isClaimed ? "online" : "warning"} label={channel.status || "open"} />
      </div>

      <section className="channel-control-shell__context" aria-label="Контекст канала">
        <dl className="channel-control-shell__facts">
          <div><dt>Маршрут</dt><dd>{routeLabel(channel)}</dd></div>
          <div><dt>Бронь</dt><dd>{valueOrDash(channel.reservation_id)}</dd></div>
          <div><dt>URL</dt><dd>{valueOrDash(channel.page_url)}</dd></div>
          <div><dt>Last seen</dt><dd>{valueOrDash(channel.last_seen_at)}</dd></div>
        </dl>
      </section>

      <section className="channel-control-shell__commands" aria-label="Команды канала">
        <div className="channel-control-shell__actions">
          {!isClaimed ? (
            <Button variant="primary" onClick={() => onClaim(channel)}>Взять канал</Button>
          ) : (
            <Button onClick={() => onRelease(channel)}>Отказаться</Button>
          )}
          <Button onClick={() => onSendCommand(channel, "refresh_snapshot")}>Обновить snapshot</Button>
          <Button onClick={() => onSendCommand(channel, "stop_pipeline")}>Стоп</Button>
          <Button variant="danger" onClick={() => onCloseChannel(channel)}>Закрыть</Button>
        </div>
      </section>

      <section className="channel-control-shell__state" aria-label="Состояние клиента">
        <strong>Состояние клиента</strong>
        <span>Команды готовы. Детали выполнения появятся после подключения клиентского snapshot.</span>
      </section>

      <section className="channel-control-shell__logs" aria-label="Логи канала">
        <strong>Логи канала</strong>
        <span>Здесь будет поток событий: команды, ответы клиента, ошибки и завершения pipeline.</span>
      </section>
    </main>
  );
}
