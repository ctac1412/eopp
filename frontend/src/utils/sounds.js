const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Resume AudioContext on first user interaction (browsers block autoplay)
function ensureAudioReady() {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

document.addEventListener("click", ensureAudioReady, { once: true });
document.addEventListener("keydown", ensureAudioReady, { once: true });

function playTone(frequency, duration, type = "sine", volume = 0.3) {
  ensureAudioReady();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + duration,
  );
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function playNewCaptchaSound() {
  playTone(880, 0.15, "sine", 0.3);
  setTimeout(() => playTone(1100, 0.2, "sine", 0.3), 150);
}

export function playChatSound() {
  _playAudio("/sounds/chat-message.mp3");
}

export function playTickSound() {
  playTone(800, 0.05, "square", 0.1);
}

export function playGongSound() {
  // Soft alert chime: gentle two-tone with fade
  playTone(520, 0.3, "sine", 0.18);
  setTimeout(() => playTone(680, 0.4, "sine", 0.15), 150);
}

export function playOperatorCaptchaSound() {
  playTone(660, 0.1, "sine", 0.25);
  setTimeout(() => playTone(880, 0.15, "sine", 0.25), 100);
}

// ── MP3-звуки ──

const _audioCache = {};

function _playAudio(src) {
  let a = _audioCache[src];
  if (!a) {
    a = new Audio(src);
    _audioCache[src] = a;
  }
  a.currentTime = 0;
  a.play().catch(() => {});
}

export function playReadinessStart() {
  _playAudio("/sounds/readiness-start.mp3");
}

export function playScheduled3Sec() {
  _playAudio("/sounds/scheduled-3sec.mp3");
}

export function playScheduledNew() {
  _playAudio("/sounds/scheduled-new.mp3");
}
