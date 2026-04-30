const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

// Resume AudioContext on first user interaction (browsers block autoplay)
function ensureAudioReady() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
}

document.addEventListener('click', ensureAudioReady, { once: true })
document.addEventListener('keydown', ensureAudioReady, { once: true })

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  ensureAudioReady()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.value = volume
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start()
  osc.stop(audioCtx.currentTime + duration)
}

export function playNewCaptchaSound() {
  playTone(880, 0.15, 'sine', 0.3)
  setTimeout(() => playTone(1100, 0.2, 'sine', 0.3), 150)
}