import React, { useState, useEffect } from "react";
import { Card, Checkbox } from "antd";
import useCaptchaStore from "../../../store/useCaptchaStore";
import { Button, EmptyState } from "../../../ui";

function SuperKioskPanel() {
  const helpFor = useCaptchaStore((s) => s.helpFor);
  const setHelpFor = useCaptchaStore((s) => s.setHelpFor);
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [ownKeyId, setOwnKeyId] = useState(null);

  useEffect(() => {
    if (!apiKey) return;
    fetch(`/validate-key?api_key=${encodeURIComponent(apiKey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.api_key_id) {
          setOwnKeyId(data.api_key_id);
        }
      })
      .catch(() => {});
  }, [apiKey]);

  useEffect(() => {
    const hasAdminSession = localStorage.getItem("admin_session_active") === "1";
    if (!hasAdminSession) {
      setLoading(false);
      return;
    }
    fetch("/api-keys")
      .then((r) => r.json())
      .then((data) => {
        const filtered = (Array.isArray(data) ? data : []).filter(
          (key) => key.active && !key.is_admin && key.id !== ownKeyId,
        );
        setKeys(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ownKeyId]);

  const toggleKey = (id) => {
    setPending((prev) => {
      const current = prev !== null ? prev : helpFor;
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  };

  const apply = () => {
    setHelpFor(pending !== null ? pending : helpFor);
    setPending(null);
  };

  const selectAll = () => {
    setPending(keys.map((key) => key.id));
  };

  const deselectAll = () => {
    setPending([]);
  };

  const current = pending !== null ? pending : helpFor;
  const activeCount = current.length;
  const totalCount = keys.length;

  if (loading) {
    return (
      <Card
        data-eopp-component="SuperKioskPanel"
        className="super-kiosk-panel"
        size="small"
      >
        <EmptyState title="Загрузка ключей..." />
      </Card>
    );
  }

  if (keys.length === 0) {
    return (
      <Card
        data-eopp-component="SuperKioskPanel"
        className="super-kiosk-panel"
        size="small"
      >
        <EmptyState title="Нет доступных ключей" />
      </Card>
    );
  }

  return (
    <Card
      data-eopp-component="SuperKioskPanel"
      className="super-kiosk-panel"
      size="small"
      title={`Супер Киоск — помогаю: ${activeCount} из ${totalCount}`}
      extra={
        <div className="super-kiosk-panel__actions">
          <Button size="small" onClick={selectAll}>
            Все
          </Button>
          <Button size="small" onClick={deselectAll}>
            Никого
          </Button>
        </div>
      }
    >
      <div className="super-kiosk-panel__list">
        {keys.map((key) => {
          const checked = current.includes(key.id);
          return (
            <Checkbox
              data-eopp-component="SuperKioskKeyCheckbox"
              key={key.id}
              className="super-kiosk-panel__item"
              checked={checked}
              onChange={() => toggleKey(key.id)}
            >
              <span className="super-kiosk-panel__name">{key.label || key.key}</span>
              {key.comment && (
                <span className="super-kiosk-panel__comment">({key.comment})</span>
              )}
            </Checkbox>
          );
        })}
      </div>

      <div className="super-kiosk-panel__footer">
        {pending !== null ? (
          <>
            <Button size="small" onClick={() => setPending(null)}>
              Отмена
            </Button>
            <Button size="small" variant="primary" onClick={apply}>
              Применить
            </Button>
          </>
        ) : (
          <span className="super-kiosk-panel__hint">
            {helpFor.length === 0 ? "Помогаю всем (подписки не заданы)" : "Нажмите на чекбокс для изменения"}
          </span>
        )}
      </div>
    </Card>
  );
}

export default React.memo(SuperKioskPanel);
