import React from 'react'
import useCaptchaStore from '../store/useCaptchaStore'

function CaptchaCard({ entry, index }) {
  const isSelected = useCaptchaStore((s) => s.selectedCard === index && s.selectedCaptchaId === entry.id)
  const setSelectedCard = useCaptchaStore((s) => s.setSelectedCard)

  const handleClick = async () => {
    setSelectedCard(entry.id, index)

    const res = await fetch('/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        captcha_id: entry.id,
        variantIndex: parseInt(index),
      }),
    })
    const data = await res.json()

    useCaptchaStore.getState().markSolved(entry.id)
    useCaptchaStore
      .getState()
      .addLog(
        `Решено: ${entry.id} → #${index}  (${data.resultFile})`,
        'success'
      )

    fetch('/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'captcha_solved',
        captcha_id: entry.id,
      }),
    })
  }

  const rank = entry.top3.indexOf(String(index))

  return (
    <div
      className={'card' + (isSelected ? ' selected' : '')}
      data-index={index}
      onClick={handleClick}
    >
      {rank >= 0 && (
        <div className={'badge badge-' + (rank + 1)}>TOP {rank + 1}</div>
      )}
      <img
        className="captcha-img"
        src={'data:image/png;base64,' + entry.images[index]}
        alt={`Variant ${index}`}
      />
      <div className="card-label">#{index}</div>
    </div>
  )
}

export default React.memo(CaptchaCard)
