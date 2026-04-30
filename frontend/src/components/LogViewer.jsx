import React from 'react'
import useCaptchaStore from '../store/useCaptchaStore'

function LogViewer() {
  const logs = useCaptchaStore((s) => s.logs)

  return (
    <div className="section-gap">
      <div id="log">
        {logs.map((l, i) => (
          <div key={i}>
            <span className="time">{l.time}</span>
            <span className={l.cls}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default React.memo(LogViewer)
