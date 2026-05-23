import React, { useCallback, useEffect, useMemo, useState } from "react";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

function adminHeadersJson(token) {
  return { "X-Admin-Token": token };
}

export function CaptchaLabelingTab({ adminToken, onError }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [notice, setNotice] = useState("");

  const variantIndexes = useMemo(() => {
    if (!captcha?.images) return [];
    return Object.keys(captcha.images)
      .map((key) => parseInt(key, 10))
      .filter((key) => Number.isInteger(key))
      .sort((a, b) => a - b);
  }, [captcha]);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/admin/captcha-label/next", {
        headers: adminHeadersJson(adminToken),
      });
      if (res.status === 404) {
        setCaptcha(null);
        setSelectedIndex(null);
        setNotice("Неразмеченных капч не осталось.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCaptcha(data);
      setSelectedIndex(null);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const saveLabel = async () => {
    if (!captcha || selectedIndex == null) return;
    setSaving(true);
    try {
      const res = await fetch("/admin/captcha-label/save", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          captcha_id: captcha.captcha_id,
          variant_index: selectedIndex,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setNotice(`Сохранено: ${captcha.captcha_id} -> вариант ${selectedIndex}`);
      await loadNext();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="d-flex gap-2 align-items-center mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={loadNext} disabled={loading || saving}>
          {loading ? "Загрузка..." : "Следующая"}
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={saveLabel}
          disabled={saving || loading || !captcha || selectedIndex == null}
        >
          {saving ? "Сохранение..." : "Сохранить разметку"}
        </button>
        {captcha && (
          <span className="small text-muted">
            {captcha.captcha_id} • вариантов: {variantIndexes.length}
          </span>
        )}
      </div>

      {notice && <div className="alert alert-info py-2 px-3 mb-3">{notice}</div>}

      {!captcha && !loading ? (
        <div className="text-muted">Нет данных для разметки.</div>
      ) : (
        <div className="row g-3">
          {variantIndexes.map((index) => (
            <div className="col-12 col-md-6 col-xl-4" key={index}>
              <button
                type="button"
                className={`card w-100 text-start ${selectedIndex === index ? "border-primary" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedIndex(index)}
              >
                <img
                  src={`data:image/png;base64,${captcha.images[String(index)]}`}
                  alt={`Вариант ${index}`}
                  style={{ width: "100%", objectFit: "contain", maxHeight: "280px" }}
                />
                <div className="card-body py-2 px-3 d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">Вариант {index}</span>
                  {selectedIndex === index && <span className="badge bg-primary">Выбран</span>}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

