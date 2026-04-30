import React from 'react';
import { useInjectorStore } from '@/store';

const LiveLog = React.memo(function LiveLog() {
  const logs = useInjectorStore((s) => s.logs);
  const logRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="injector-live-log">
      <div className="injector-live-log-header">Live Log ({logs.length})</div>
      <div className="injector-live-log-body" ref={logRef}>
        {logs.map((entry, i) => (
          <div key={i} className="injector-log-line">
            <span className="injector-log-ts">{entry.ts}</span> {entry.msg}
          </div>
        ))}
      </div>
    </div>
  );
});

export default LiveLog;
