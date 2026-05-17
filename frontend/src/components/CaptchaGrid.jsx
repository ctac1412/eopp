/**
 * EOPP Captcha Solver - CaptchaGrid
 */
import React from "react";
import CaptchaCard from "./CaptchaCard";
import CountdownTimer from "./CountdownTimer";
import useCaptchaStore from "../store/useCaptchaStore";

function CaptchaGrid() {
  const queue = useCaptchaStore((s) => s.queue);
  const unsolved = queue.filter((q) => !q.solved);
  const active = unsolved[0] || null;

  if (!active) {
    return (
      <div className="idle-state d-flex flex-column align-items-center justify-content-center text-center" style={{ minHeight: "400px" }}>
        <div className="idle-spinner mb-3" />
        <h6 className="mb-1 fw-semibold" style={{ color: "#8b949e" }}>Ожидание запросов</h6>
        <p className="mb-0" style={{ fontSize: "0.75rem", color: "#484f58" }}>
          Подключено к серверу, новые капчи появятся автоматически
        </p>
      </div>
    );
  }

  const imgKeys = Object.keys(active.images);
  const top3 = active.top3;

  const ordered = imgKeys.slice().sort((a, b) => {
    const ra = top3.indexOf(a), rb = top3.indexOf(b);
    if (ra >= 0 && rb >= 0) return ra - rb;
    if (ra >= 0) return -1;
    if (rb >= 0) return 1;
    return parseInt(a) - parseInt(b);
  });

  return (
    <div className="card" style={{ animation: "fade-in 0.3s ease", height: "100%" }}>
      <div className="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span className="fw-semibold" style={{ fontSize: "0.8125rem" }}>Капча {active.id} — выберите вариант</span>
        <div className="d-flex align-items-center gap-2">
          <CountdownTimer createdAt={active.createdAt} timeout={active.timeout} />
          <div className="d-flex gap-1">
            {top3.map((t, i) => (
              <span className={`rank-badge rank-badge--${i + 1}`} key={i}>
                #{i + 1} = {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="card-body p-3 d-flex align-items-center justify-content-center flex-grow-1" style={{ overflow: "auto", minHeight: 0 }}>
        <div className="row g-3 w-100 justify-content-center">
          {ordered.map((key) => (
            <div className="col-3 col-md-2 col-lg-2" key={active.id + "-" + key}>
              <CaptchaCard entry={active} index={key} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CaptchaGrid;
