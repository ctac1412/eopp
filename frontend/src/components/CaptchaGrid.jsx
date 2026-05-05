import React from 'react'
import CaptchaCard from './CaptchaCard'
import CountdownTimer from './CountdownTimer'
import useCaptchaStore from '../store/useCaptchaStore'

function CaptchaGrid() {
  const queue = useCaptchaStore((s) => s.queue)
  const unsolved = queue.filter((q) => !q.solved)
  const active = unsolved[0] || null

  if (!active) {
    return (
      <div className="captcha-grid-wrapper">
        <div className="captcha-idle">
          <div className="captcha-idle-spinner" />
          <div className="captcha-idle-text">
            <span className="captcha-idle-text-main">Ожидание запросов...</span>
            <span className="captcha-idle-text-sub">Подключено к серверу, новые капчи появятся автоматически</span>
          </div>
        </div>
      </div>
    )
  }

  const imgKeys = Object.keys(active.images)
  const top3 = active.top3

  const ordered = imgKeys.slice().sort((a, b) => {
    const ra = top3.indexOf(a),
      rb = top3.indexOf(b)
    if (ra >= 0 && rb >= 0) return ra - rb
    if (ra >= 0) return -1
    if (rb >= 0) return 1
    return parseInt(a) - parseInt(b)
  })

  return (
    <div className="captcha-grid-wrapper">
      <div className="active-section" id="activeSection">
        <div className="active-header">
          <div className="active-title">
            Капча {active.id} — выберите вариант
          </div>
          <div className="active-header-right">
            <CountdownTimer createdAt={active.createdAt} timeout={active.timeout} />
            <div className="top3-chips">
              {top3.map((t, i) => (
                <span className={'chip chip-' + (i + 1)} key={i}>
                  #{i + 1} = {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid">
          {ordered.map((key) => (
            <CaptchaCard key={active.id + '-' + key} entry={active} index={key} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default CaptchaGrid
