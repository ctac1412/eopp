import React from "react";
import { useInjectorStore } from "@/store";

const LiveLog = React.memo(function LiveLog() {
  const logs = useInjectorStore((s) => s.logs);
  const logRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="qn-live-log">
      <div className="qn-live-log-header">Журнал ({logs.length})</div>
      <div className="qn-live-log-body" ref={logRef}>
        {logs.length === 0 ? (
          <div className="qn-log-empty">Ожидание логов...</div>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="qn-log-line">
              <span className="qn-log-ts">{entry.ts}</span> {entry.msg}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export default LiveLog;
