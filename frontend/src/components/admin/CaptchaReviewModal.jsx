import React, { useState } from "react";
import { Modal } from "antd";

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

export function CaptchaReviewModal({ captcha, open, onClose }) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const answers = Array.isArray(captcha?.operator_answers) ? captcha.operator_answers : [];
  const imageUrl = captcha?.captcha_id
    ? `/admin/captcha-files/${encodeURIComponent(captcha.captcha_id)}/thumbnail`
    : "";

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
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
            />
          ) : (
            <div className="captcha-review__empty">Нет изображения</div>
          )}
          {imageSize.width > 0 && imageSize.height > 0 && answers.map((answer, index) => {
            const left = Math.max(0, Math.min(100, (Number(answer.x) / imageSize.width) * 100));
            const top = Math.max(0, Math.min(100, (Number(answer.y) / imageSize.height) * 100));
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
