import React, { useEffect, useState } from "react";
import { Modal } from "antd";
import { backend } from "../../../shared/api/backend";

function formatActionTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function normalizeCoordinate(value, size) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || size <= 0) return 0;
  const absolute = numeric > 0 && numeric <= 1 ? numeric * size : numeric;
  return Math.max(0, Math.min(100, (absolute / size) * 100));
}

export function CaptchaReviewModal({ captcha, open, onClose }) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [labelPreview, setLabelPreview] = useState(null);
  const answers = Array.isArray(captcha?.operator_answers) ? captcha.operator_answers : [];
  const mainImage = labelPreview?.images?.["0"] || "";
  const iconsImage = labelPreview?.icons_image || "";

  useEffect(() => {
    setImageSize({ width: 0, height: 0 });
    setLabelPreview(null);
    if (!open || !captcha?.captcha_id) return;

    let cancelled = false;
    backend.admin.captchaLabel.get(captcha.captcha_id)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setLabelPreview(data);
      })
      .catch(() => {
        if (!cancelled) setLabelPreview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [captcha?.captcha_id, open]);

  return (
    <Modal
      data-eopp-component="CaptchaReviewModal"
      open={open}
      title={captcha?.captcha_id ? `Отсмотр капчи ${captcha.captcha_id}` : "Отсмотр капчи"}
      onCancel={onClose}
      footer={null}
      width={840}
      destroyOnClose
    >
      <div className="captcha-review">
        <div className="captcha-review__stage">
          {mainImage ? (
            <>
              <div className="captcha-review__image-layer">
                <img
                  src={`data:image/png;base64,${mainImage}`}
                  alt=""
                  onLoad={(event) => {
                    setImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                />
                {imageSize.width > 0 && imageSize.height > 0 && answers.map((answer, index) => {
                  const left = normalizeCoordinate(answer.x, imageSize.width);
                  const top = normalizeCoordinate(answer.y, imageSize.height);
                  const label = answer.operator_nickname || `#${answer.operator_id}`;
                  const time = formatActionTime(answer.created_at);
                  return (
                    <div
                      key={`${answer.operator_id}-${answer.icon_position}-${index}`}
                      className="captcha-review-marker"
                      style={{ left: `${left}%`, top: `${top}%` }}
                      title={`${label}: ${time}`}
                    >
                      <span className="captcha-review-marker__dot">{Number(answer.icon_position ?? 0) + 1}</span>
                      <span className="captcha-review-marker__label">{label}{time ? ` · ${time}` : ""}</span>
                    </div>
                  );
                })}
              </div>
              {iconsImage && (
                <img
                  className="captcha-review__icons"
                  src={`data:image/png;base64,${iconsImage}`}
                  alt="Иконки"
                  draggable={false}
                />
              )}
            </>
          ) : (
            <div className="captcha-review__empty">Нет изображения</div>
          )}
        </div>
        <div className="captcha-review__legend">
          {answers.length === 0 ? (
            <span className="text-muted">Нет операторских кликов</span>
          ) : answers.map((answer, index) => (
            <span key={`${answer.operator_id}-${answer.created_at}-${index}`}>
              {answer.operator_nickname || `#${answer.operator_id}`} · иконка {Number(answer.icon_position ?? 0) + 1}
              {answer.duration_ms != null ? ` · ${answer.duration_ms} ms` : ""}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}
