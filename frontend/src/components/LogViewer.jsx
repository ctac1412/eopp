import React from "react";
import useCaptchaStore from "../store/useCaptchaStore";

function LogViewer() {
  const logs = useCaptchaStore((s) => s.logs);

  return (
    <div className="section-gap">
      <div className="log-viewer">
        {logs.map((l, i) => (
          <div key={i} className="log-viewer__entry">
            <span className="log-viewer__time">{l.time}</span>
            <span className={l.cls === "success" ? "log-viewer__success" : l.cls === "error" ? "log-viewer__error" : "log-viewer__action"}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(LogViewer);
