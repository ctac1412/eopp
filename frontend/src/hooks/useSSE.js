/**
 * EOPP Captcha Solver - SSE Hook (Server-Sent Events)
 *
 * Подключается к /stream?api_key=... и слушает события:
 * - new_captcha: новая капча для решения -> addCaptcha
 * - captcha_solved: капча решена -> markSolved
 * - captcha_timeout: таймаут -> removeCaptcha
 * - disconnected: другое подключение активно -> setSseError
 *
 * Особенности:
 * - Автоматическое переподключение при ошибках (до 10 попыток)
 * - Звуковое уведомление при новой капче
 * - Логирование всех событий
 *
 * Использует: useCaptchaStore (addCaptcha, markSolved, removeCaptcha, addLog, setSseError)
 */
import { useEffect } from "react";
import useCaptchaStore from "../store/useCaptchaStore";
import { playNewCaptchaSound } from "../utils/sounds";

const sounded = new Set();

function useSSE(enabled = true) {
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const addCaptcha = useCaptchaStore((s) => s.addCaptcha);
  const markSolved = useCaptchaStore((s) => s.markSolved);
  const removeCaptcha = useCaptchaStore((s) => s.removeCaptcha);
  const addLog = useCaptchaStore((s) => s.addLog);
  const setSseError = useCaptchaStore((s) => s.setSseError);

  useEffect(() => {
    if (!enabled) return;
    let es;
    let closed = false;
    let retryCount = 0;

    function connect() {
      if (closed) return;
      let url = "/stream";
      if (apiKey) {
        url += `?api_key=${encodeURIComponent(apiKey)}`;
      } else {
        addLog("SSE: API ключ не установлен, подключение невозможно", "error");
        return;
      }
      es = new EventSource(url);

      es.onmessage = (e) => {
        if (closed) return;
        const wasRetrying = retryCount > 0;
        retryCount = 0;
        if (wasRetrying) {
          setSseError(null);
        }
        const msg = JSON.parse(e.data);

        if (msg.type === "disconnected") {
          setSseError(
            msg.message ||
              "Другое подключение к этому ключу активно. Закройте другую вкладку.",
          );
          addLog(
            `SSE: ${msg.message || "Другое подключение активно"}`,
            "error",
          );
          es.close();
          closed = true;
          return;
        }

        if (msg.type === "new_captcha") {
          if (sounded.has(msg.captcha_id)) return;
          sounded.add(msg.captcha_id);

          const wasEmpty = useCaptchaStore.getState().getUnsolvedCount() === 0;
          addCaptcha({
            id: msg.captcha_id,
            images: msg.images,
            top3: msg.top3 || [],
            count: msg.count,
            created_at: msg.created_at,
            timeout: msg.timeout || 10,
          });
          if (wasEmpty) {
            playNewCaptchaSound();
          }
          addLog(`Капча ${msg.captcha_id} — ${msg.count} вариантов`);
        }

        if (msg.type === "captcha_solved") {
          markSolved(msg.captcha_id);
          sounded.delete(msg.captcha_id);
        }

        if (msg.type === "captcha_timeout") {
          removeCaptcha(msg.captcha_id);
          sounded.delete(msg.captcha_id);
          addLog(`Капча ${msg.captcha_id} — таймаут`, "error");
        }
      };

      es.onerror = () => {
        const status = es.readyState === EventSource.CONNECTING ? 0 : es.url;
        es.close();
        if (closed) return;
        retryCount++;
        if (retryCount > 10) {
          addLog("SSE: превышено количество попыток переподключения", "error");
          setSseError("SSE: не удалось подключиться");
          return;
        }
        setSseError("Соединение разорвано, переподключение...");
        const delay = Math.min(2000 * Math.pow(1.5, retryCount - 1), 30000);
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      closed = true;
      if (es) es.close();
    };
  }, [apiKey, addCaptcha, markSolved, removeCaptcha, addLog, setSseError, enabled]);
}

export default useSSE;
