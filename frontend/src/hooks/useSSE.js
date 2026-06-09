/**
 * EOPP Captcha Solver - SSE Hook (Server-Sent Events)
 *
 * Подключается к /stream?api_key=...&super_kiosk=1 и слушает события:
 * - new_captcha: новая капча для решения -> addCaptcha
 * - captcha_solved: капча решена -> markSolved
 * - captcha_timeout: таймаут -> removeCaptcha
 * - disconnected: другое подключение активно -> setSseError
 *
 * Особенности:
 * - Автоматическое переподключение при ошибках (до 10 попыток)
 * - Звуковое уведомление при новой капче
 * - Логирование всех событий
 * - Поддержка режима супер-киоска (?super_kiosk=1)
 *
 * Использует: useCaptchaStore (addCaptcha, markSolved, removeCaptcha, addLog, setSseError)
 */
import { useEffect } from "react";
import useCaptchaStore from "../store/useCaptchaStore";
import { playNewCaptchaSound } from "../utils/sounds";

const sounded = new Set();

function useSSE(enabled = true) {
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);
  const helpFor = useCaptchaStore((s) => s.helpFor);
  const addCaptcha = useCaptchaStore((s) => s.addCaptcha);
  const markSolved = useCaptchaStore((s) => s.markSolved);
  const removeCaptcha = useCaptchaStore((s) => s.removeCaptcha);
  const addLog = useCaptchaStore((s) => s.addLog);
  const setSseError = useCaptchaStore((s) => s.setSseError);
  const setSseConnected = useCaptchaStore((s) => s.setSseConnected);
  const reconnectKey = useCaptchaStore((s) => s.reconnectKey);

  useEffect(() => {
    if (!enabled) return;
    let es;
    let closed = false;
    let retryCount = 0;
    let wasForceReconnect = false;

    function connect() {
      if (closed) return;
      const store = useCaptchaStore.getState();
      const useForce = store.pendingForceReconnect;
      let url = "/stream";
      if (apiKey) {
        const params = new URLSearchParams({ api_key: apiKey });
        if (superKioskMode) {
          params.set("super_kiosk", "1");
          if (helpFor && helpFor.length > 0) {
            params.set("help_for", helpFor.join(","));
          }
        }
        if (useForce) {
          params.set("force", "1");
          store.setPendingForceReconnect(false);
          wasForceReconnect = true;
        }
        url += `?${params.toString()}`;
      } else {
        addLog("SSE: API ключ не установлен, подключение невозможно", "error");
        return;
      }
      es = new EventSource(url);

      es.onopen = () => {
        setSseConnected(true);
        if (wasForceReconnect) {
          addLog("SSE: подключение перехвачено", "success");
          wasForceReconnect = false;
        }
      };

      es.onmessage = (e) => {
        if (closed) return;
        retryCount = 0;
        setSseError(null);
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

        if (msg.type === "connected" && msg.operators_online) {
          useCaptchaStore.getState().setConnectedOperators(msg.operators_online);
        }

        if (msg.type === "operator_connected") {
          const store = useCaptchaStore.getState();
          const current = new Set(store.connectedOperators);
          current.add(msg.operator_id);
          store.setConnectedOperators([...current]);
          addLog(`Оператор «${msg.operator_nickname}» подключился`, "success");
        }

        if (msg.type === "operator_disconnected") {
          const store = useCaptchaStore.getState();
          const current = new Set(store.connectedOperators);
          current.delete(msg.operator_id);
          store.setConnectedOperators([...current]);
          addLog(`Оператор «${msg.operator_nickname}» отключился`, "error");
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
            ownerLabel: msg.owner_label || null,
            ownerApiKeyId: msg.owner_api_key_id || null,
            confident: msg.confident || false,
            captchaType: msg.captcha_type || 0,
            iconsImage: msg.icons_image || "",
            distribution: msg.distribution || null,
            allIcons: msg.all_icons || [],
          });
          if (wasEmpty) {
            playNewCaptchaSound();
          }
          const ownerInfo = msg.owner_label ? ` (${msg.owner_label})` : "";
          addLog(`Капча ${msg.captcha_id}${ownerInfo}`);
        }

        if (msg.type === "captcha_solved") {
          markSolved(msg.captcha_id, msg.solved_by_super || false, msg.solver_label || null);
          sounded.delete(msg.captcha_id);
          if (msg.solved_by_super) {
            addLog(`Капча ${msg.captcha_id} — решена из Супер Киоска (${msg.solver_label || "?"})`, "success");
          } else {
            addLog(`Капча ${msg.captcha_id} — решена (${msg.solver_label || msg.owner_label || "?"})`, "success");
          }
        }

        if (msg.type === "captcha_timeout") {
          removeCaptcha(msg.captcha_id);
          sounded.delete(msg.captcha_id);
          addLog(`Капча ${msg.captcha_id} — таймаут`, "error");
        }

        if (msg.type === "distribution_progress") {
          useCaptchaStore.getState().updateDistributionProgress(
            msg.captcha_id,
            msg.solved_count,
            msg.answered_positions || [],
            msg.all_coords || {},
          );
        }
      };

      es.onerror = () => {
        setSseConnected(false);
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
      setSseConnected(false);
      if (es) es.close();
    };
  }, [apiKey, superKioskMode, helpFor, addCaptcha, markSolved, removeCaptcha, addLog, setSseError, enabled, reconnectKey]);
}

export default useSSE;
