import { useEffect } from 'react'
import useCaptchaStore from '../store/useCaptchaStore'
import { playNewCaptchaSound } from '../utils/sounds'

const sounded = new Set()

function useSSE() {
  const apiKey = useCaptchaStore((s) => s.apiKey)
  const addCaptcha = useCaptchaStore((s) => s.addCaptcha)
  const markSolved = useCaptchaStore((s) => s.markSolved)
  const removeCaptcha = useCaptchaStore((s) => s.removeCaptcha)
  const addLog = useCaptchaStore((s) => s.addLog)

  useEffect(() => {
    let es
    let closed = false

    function connect() {
      if (closed) return
      let url = '/stream'
      if (apiKey) {
        url += `?api_key=${encodeURIComponent(apiKey)}`
      }
      es = new EventSource(url)

      es.onmessage = (e) => {
        if (closed) return
        const msg = JSON.parse(e.data)

        if (msg.type === 'new_captcha') {
          if (sounded.has(msg.captcha_id)) return
          sounded.add(msg.captcha_id)

          const wasEmpty = useCaptchaStore.getState().getUnsolvedCount() === 0
          addCaptcha({
            id: msg.captcha_id,
            images: msg.images,
            top3: msg.top3 || [],
            count: msg.count,
            created_at: msg.created_at,
            timeout: msg.timeout || 10,
          })
          if (wasEmpty) {
            playNewCaptchaSound()
          }
          addLog(`Капча ${msg.captcha_id} — ${msg.count} вариантов`)
        }

        if (msg.type === 'captcha_solved') {
          markSolved(msg.captcha_id)
          sounded.delete(msg.captcha_id)
        }

        if (msg.type === 'captcha_timeout') {
          removeCaptcha(msg.captcha_id)
          sounded.delete(msg.captcha_id)
          addLog(`Капча ${msg.captcha_id} — таймаут`, 'error')
        }
      }

      es.onerror = () => {
        es.close()
        if (!closed) {
          setTimeout(connect, 2000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      if (es) es.close()
    }
  }, [apiKey, addCaptcha, markSolved, removeCaptcha, addLog])
}

export default useSSE
