function extractParams(json) {
  const vehicleId = json.vehicleData[0].vehicleId;
  const facilityId = json.facilityId;
  // const transportType = json.typeOfTransportation;
  const transportType = 1;
  return { vehicleId, facilityId, transportType };
}

function shouldInject(pageUrl) {
  const match = pageUrl.match(/\/reservations\/reservation\/([a-f0-9-]{36})\/edit/);
  if (match) {
    return { reservationId: match[1] };
  }
  if (pageUrl.startsWith('https://localhost:8765') || pageUrl.startsWith('https://127.0.0.1:8765') || pageUrl.startsWith('https://china.alabai.netcraze.pro/')) {
    return { reservationId: '00000000-0000-0000-0000-000000000000', isLocalhost: true };
  }
  return null;
}

// ========================================
//  Утилиты
// ========================================

const usedSlotIds = new Set();
let currentConfig = null;
let scheduledConfig = null;
let scheduledTime = null;
let scheduleInterval = null;
const TZ_OFFSET = 3;

function log(msg, data) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[injector ${ts}] ${msg}`, data !== undefined ? data : '');
}

function resetUsedSlots() {
  usedSlotIds.clear();
}

function httpRequest(method, url, body, extraHeaders) {
  return fetch(url, {
    method,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    if (res.status === 429) {
      return Promise.reject({ status: 429, body: null });
    }
    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch { /* ignore */ }
      return Promise.reject({ status: res.status, body: bodyText });
    }
    return res.json();
  });
}

function sendMessageToBackground(action, payload) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: `${action}-${Date.now()}` });
    port.postMessage({ action, payload });
    port.onMessage.addListener((response) => {
      port.disconnect();
      if (response && response.ok) {
        resolve(response.data);
      } else {
        reject(response ? response.error : new Error('No response'));
      }
    });
    port.onDisconnect.addListener(() => {
      if (!port._responded) {
        reject(new Error('Connection closed before response'));
      }
    });
  });
}

async function retryOn429(fn, retries, delayMs) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err && err.status === 429 && i < retries) {
        log(`Получен 429, повтор через ${delayMs / 1000}с (попытка ${i + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

// ========================================
//  Этап 1 — Получение свободных слотов
// ========================================

async function getAvailableSlots() {
  log('Этап 1: получение свободных слотов');

  const isCreateReservation = currentConfig.mode === 'create';

  var url = `/reservations-api/v1/timeslot/AvailableSlots?facilityId=${currentConfig.facilityId}&vehicleId=${currentConfig.vehicleId}&date=${currentConfig.slotDate}&transportType=${currentConfig.transportType}&isCreateReservation=${isCreateReservation}`;
  if (currentConfig.mode !== 'create') {
    url += `&reservationId=${currentConfig.reservationId}`
  }

  //   Слоты кончились статус 400
  //   {
  //     "title": "SlotsNotFound",
  //     "status": 400,
  //     "detail": "IsSuccess: False SlotsNotFound 41104",
  //     "eoppStatus": 41104,
  //     "payload": null,
  //     "isSuccess": false
  //  }

  const response = await httpRequest('GET', url);
  log(`Получено ${response.slots?.length || 0} доступных слотов`);
  return response;
}

// ========================================
//  Выбор лучшего слота
// ========================================

function selectBestSlot(slots) {
  log('Выбор лучшего слота');

  const availableSlots = slots.filter((slot) => !usedSlotIds.has(slot.id));

  if (currentConfig.preferredTime) {
    const preferredSlot = availableSlots.find((slot) => slot.time === currentConfig.preferredTime);
    if (preferredSlot) {
      log(`Найден предпочтительный слот: ${preferredSlot.slotCaption}`);
      usedSlotIds.add(preferredSlot.id);
      return preferredSlot;
    }
    log(`Предпочтительный слот ${currentConfig.preferredTime} недоступен, выбираем по другому критерию`);
  }

  if (availableSlots.length === 0) {
    throw new Error('Нет доступных слотов');
  }

  const maxCount = Math.max(...availableSlots.map((s) => s.count));
  const bestSlots = availableSlots.filter((s) => s.count === maxCount);
  const selected = bestSlots[Math.floor(Math.random() * bestSlots.length)];

  usedSlotIds.add(selected.id);
  log(`Выбран слот: ${selected.slotCaption} (count: ${selected.count})`);
  return selected;
}

// ========================================
//  Этап 2 — Генерация капчи
// ========================================

async function generateCaptcha(slotData) {
  log('Этап 2: генерация капчи');

  const payload = {
    facilityId: currentConfig.facilityId,
    timeSlotData: `${currentConfig.slotDate}T${slotData.time}.000Z`,
    reservationId: currentConfig.reservationId,
    encryptedTso: null,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/captcha', payload);

  // Слота больше нет
  // {
  //     "title": "CaptchaNotExistFreeTimeslot",
  //     "status": 400,
  //     "detail": "Для данного АПП (1dae5b1c-e2b3-44a4-848f-df8ce2ddde42) не найдены таймслоты на 13.05.2026 10:00",
  //     "eoppStatus": 40144,
  //     "payload": null,
  //     "isSuccess": false
  // }
  log('Капча сгенерирована');
  return response;
}

// ========================================
//  Этап 3 — Решение капчи (через background)
// ========================================

async function solveCaptcha(captchaData) {
  log('Этап 3: запрос к нашему серверу /solve-captcha');

  const payload = {
    ...captchaData,
    auto_solve: currentConfig.autoSolve,
  };

  const response = await sendMessageToBackground('solveCaptcha', payload);
  log('Капча решена');
  return response;
}

// ========================================
//  Этап 4 — Валидация капчи
// ========================================

async function validateCaptcha(captchaData, slotData, solvedAnswer) {
  log('Этап 4: валидация капчи');

  const payload = {
    captchaToken: captchaData.token,
    answer: solvedAnswer.variantTiles,
    facilityId: currentConfig.facilityId,
    timeSlotData: `${currentConfig.slotDate}T${slotData.time}.000Z`,
    reservationId: currentConfig.reservationId,
    encryptedTso: null,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/captcha-validate', payload);
  log('Капча валидирована');
  return response;
}

// ========================================
//  Этап 5 — Перенос брони
// ========================================

async function submitReschedule(slotData, captchaValidation) {
  log('Этап 5: перенос брони (Reschedule)');

  const payload = {
    reservationRequestId: currentConfig.reservationId,
    timeslot: `${currentConfig.slotDate.split('-').slice(1).reverse().join('.')}, ${slotData.slotCaption}`,
    date: currentConfig.slotDate,
    transportType: currentConfig.transportType,
    intervalIndex: slotData.intervalIndex,
    facilityId: currentConfig.facilityId,
    captchaToken: captchaValidation.successToken,
    encryptedTso: null,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/Reschedule', payload);
  log('Бронь перенесена');
  return response;
}

// ========================================
//  Этап 5 — Создание брони
// ========================================

async function submitCreate(slotData, captchaValidation) {
  log('Этап 5: создание брони (CreateReservation)');

  const payload = {
    reservationId: currentConfig.reservationId,
    facilityId: currentConfig.facilityId,
    arrivalDatePlan: currentConfig.slotDate,
    intervalIndex: slotData.intervalIndex,
    transportType: currentConfig.transportType,
    modeType: 1,
    isTso: false,
    encryptedTso: null,
    captchaToken: captchaValidation.successToken,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/CreateReservation', payload, {
    'FacilityMode': 'false',
  });
  log('Бронь создана');
  return response;
}

// ========================================
//  Главный поток
// ========================================

async function runFromStage2(slotsResponse) {
  const slotData = selectBestSlot(slotsResponse.slots);
  log('Выбранный слот', slotData);

  if (currentConfig.runUpTo < 2) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const captchaResponse = await retryOn429(
    () => generateCaptcha(slotData),
    currentConfig.maxRetries,
    currentConfig.retryDelayMs
  );

  if (currentConfig.runUpTo < 3) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const solvedAnswer = await solveCaptcha(captchaResponse);
  log('Ответ от нашего сервера', solvedAnswer);

  if (currentConfig.runUpTo < 4) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const validationResponse = await retryOn429(
    () => validateCaptcha(captchaResponse, slotData, solvedAnswer),
    currentConfig.maxRetries,
    currentConfig.retryDelayMs
  );

  if (currentConfig.runUpTo < 5) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const isCreateReservation = currentConfig.mode === 'create';
  const submitFn = isCreateReservation ? submitCreate : submitReschedule;
  const submitResponse = await retryOn429(
    () => submitFn(slotData, validationResponse),
    currentConfig.maxRetries,
    currentConfig.retryDelayMs
  );

  return submitResponse;
}

async function main(config) {
  currentConfig = config;
  log('=== Старт скрипта (runUpTo: ' + config.runUpTo + ') ===');

  try {
    const slotsResponse = await getAvailableSlots();
    let slotRetryCount = 0;

    while (slotRetryCount <= config.maxSlotRetries) {
      try {
        const result = await runFromStage2(slotsResponse);
        if (result !== null) {
          log('=== Скрипт завершён успешно ===', result);
        }
        return;
      } catch (err) {
        const isAllSlotsOccupied = err && err.body && err.body.includes('AllSlotsOccupiedOnInterval');

        if (isAllSlotsOccupied && config.retryOnAllSlotsOccupied && slotRetryCount < config.maxSlotRetries) {
          slotRetryCount++;
          log(`AllSlotsOccupiedOnInterval — пробуем другой слот (попытка ${slotRetryCount}/${config.maxSlotRetries})`);
          await new Promise((r) => setTimeout(r, config.slotRetryDelayMs));
          continue;
        }

        log('=== ОШИБКА ===', err);
        return;
      }
    }

    log('=== Превышено количество попыток выбора слота ===');
  } catch (err) {
    log('=== ОШИБКА ===', err);
  }
}

// ========================================
//  Модальное окно
// ========================================

function getMSKTime() {
  const now = new Date();
  const utcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const mskSec = (utcSec + TZ_OFFSET * 3600) % 86400;
  const h = Math.floor(mskSec / 3600);
  const m = Math.floor((mskSec % 3600) / 60);
  const s = mskSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseTime(str) {
  const parts = str.trim().split(':');
  if (parts.length !== 3) return null;
  const [h, m, s] = parts.map(Number);
  if (isNaN(h) || isNaN(m) || isNaN(s) || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

function mskToUtcSeconds(mskSeconds) {
  return ((mskSeconds - TZ_OFFSET * 3600) % 86400 + 86400) % 86400;
}

function getMsUntilTarget(targetUtcSeconds) {
  const now = new Date();
  const currentUtcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const currentMs = currentUtcSec * 1000 + now.getUTCMilliseconds();
  const targetMs = targetUtcSeconds * 1000;
  let diff = targetMs - currentMs;
  if (diff <= 0) diff += 86400000;
  return diff;
}

function getRemainingSeconds(targetUtcSeconds) {
  return Math.max(0, Math.ceil(getMsUntilTarget(targetUtcSeconds) / 1000));
}

function formatCountdown(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clearSchedule() {
  if (scheduleInterval) {
    clearTimeout(scheduleInterval);
    scheduleInterval = null;
  }
  scheduledConfig = null;
  scheduledTime = null;
}

function scheduleTick(targetUtcSeconds, config, clockEl, statusEl) {
  const now = new Date();
  const currentUtcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const targetSec = targetUtcSeconds % 86400;
  const fired = currentUtcSec === targetSec;

  if (fired) {
    clearSchedule();
    log('Таймер истек, запускаю инжектор...');
    main(config).then(() => {
      scheduledConfig = null;
      scheduledTime = null;
    });
    if (clockEl) clockEl.textContent = `МСК: ${getMSKTime()}`;
    if (statusEl) {
      statusEl.textContent = 'Запущено!';
      statusEl.className = 'injector-modal-status injector-modal-status-done';
    }
    return;
  }

  if (clockEl) clockEl.textContent = `МСК: ${getMSKTime()}`;
  const remaining = getRemainingSeconds(targetUtcSeconds);
  if (statusEl) {
    statusEl.textContent = `Запуск через ${formatCountdown(remaining)}`;
    statusEl.className = 'injector-modal-status injector-modal-status-waiting';
  }

  const msUntilNextSecond = 1000 - now.getUTCMilliseconds();
  scheduleInterval = setTimeout(() => {
    scheduleTick(targetUtcSeconds, config, clockEl, statusEl);
  }, msUntilNextSecond);
}

function startSchedule(targetUtcSeconds, config, clockEl, statusEl) {
  clearSchedule();
  scheduledTime = targetUtcSeconds;
  scheduledConfig = config;
  scheduleTick(targetUtcSeconds, config, clockEl, statusEl);
}

function createModal(injectorUrl, defaultConfig) {
  const overlay = document.createElement('div');
  overlay.className = 'injector-modal-overlay';
  overlay.innerHTML = `
    <div class="injector-modal injector-modal-wide">
      <div class="injector-modal-header">
        <span class="injector-modal-title">Настройки <a class="injector-server-link" href="https://china.alabai.netcraze.pro" target="_blank" rel="noopener">Капчи ↗</a></span>
        <div class="injector-header-center">
          <span class="injector-modal-status"></span>
        </div>
        <div class="injector-header-right">
          <span class="injector-modal-clock">МСК: ${getMSKTime()}</span>
          <button class="injector-modal-close">&times;</button>
        </div>
      </div>
      <div class="injector-modal-body">
        <div class="injector-config-form">
          <div class="injector-form-section" style="grid-column: 1 / -1;">
            <h3 class="injector-section-title">Общие настройки</h3>
            <div class="injector-form-row injector-form-row-3">
              <label class="injector-form-label">
                Режим
                <select class="injector-form-input" data-field="mode">
                  <option value="reschedule">Перенос брони</option>
                  <option value="create">Создание брони</option>
                </select>
              </label>
              <label class="injector-form-label">
                Остановиться на этапе
                <select class="injector-form-input" data-field="runUpTo">
                  <option value="1">1 — слоты</option>
                  <option value="2">2 — капча</option>
                  <option value="3">3 — решение капчи</option>
                  <option value="4">4 — валидация</option>
                  <option value="5">5 — отправка</option>
                </select>
              </label>
              <label class="injector-form-label injector-checkbox-label">
                <input type="checkbox" data-field="autoSolve" />
                Авто-решение капчи
              </label>
            </div>
          </div>

          <div class="injector-form-section" style="grid-column: 1 / -1;">
            <h3 class="injector-section-title">Данные запроса</h3>
            <div class="injector-form-row">
              <label class="injector-form-label">
                ID бронирования
                <span class="injector-form-text injector-form-readonly" data-field="reservationId"></span>
              </label>
              <label class="injector-form-label">
                ID транспортного средства
                <input class="injector-form-input injector-form-text" type="text" data-field="vehicleId" />
              </label>
            </div>
            <div class="injector-form-row">
              <label class="injector-form-label">
                Вид перевозки
                <select class="injector-form-input" data-field="transportType">
                  <option value="1">Экспорт</option>
                  <option value="2">Транзит</option>
                </select>
              </label>
              <label class="injector-form-label">
                Пропускной пункт (АПП)
                <select class="injector-form-input" data-field="facilityId">
                  <option value="1dae5b1c-e2b3-44a4-848f-df8ce2ddde42">АПП Забайкальск</option>
                  <option value="93c9939a-2182-4e78-98b4-0cf314b09cfa">АПП Тагиркент-Казмаляр</option>
                  <option value="cbde069a-7e18-4ca6-9b38-f790348d6c24">АПП Бугристое</option>
                  <option value="1fffb312-4ebe-4ad2-a356-0b8f04587c11">АПП Верхний Ларс</option>
                  <option value="ab6edb80-5f8f-4bf9-bf9a-a925271d9df8">АПП Чернышевское</option>
                </select>
              </label>
            </div>
            <div class="injector-form-row">
              <label class="injector-form-label">
                Дата пропуска
                <input class="injector-form-input" type="date" data-field="slotDate" />
              </label>
              <label class="injector-form-label">
                Предпочтительное время
                <select class="injector-form-input" data-field="preferredTime">
                  <option value="">Не выбрано (любой слот)</option>
                </select>
              </label>
            </div>
          </div>

          <div class="injector-form-section">
            <h3 class="injector-section-title">Повтор при занятых слотах</h3>
            <label class="injector-form-label injector-checkbox-label">
              <input type="checkbox" data-field="retryOnAllSlotsOccupied" />
              Пробовать другой слот при занятости
            </label>
            <div class="injector-form-row">
              <label class="injector-form-label">
                Макс. попыток
                <input class="injector-form-input injector-form-number" type="number" data-field="maxSlotRetries" />
              </label>
              <label class="injector-form-label">
                Задержка (мс)
                <input class="injector-form-input injector-form-number" type="number" data-field="slotRetryDelayMs" />
              </label>
            </div>
          </div>

          <div class="injector-form-section">
            <h3 class="injector-section-title">Повтор при ошибке 429</h3>
            <div class="injector-form-row">
              <label class="injector-form-label">
                Макс. попыток
                <input class="injector-form-input injector-form-number" type="number" data-field="maxRetries" />
              </label>
              <label class="injector-form-label">
                Задержка (мс)
                <input class="injector-form-input injector-form-number" type="number" data-field="retryDelayMs" />
              </label>
            </div>
          </div>
        </div>

        <div class="injector-schedule-sticky">
          <div class="injector-time-tags">
            <span class="injector-time-tag" data-time="10:00:01">10:00</span>
            <span class="injector-time-tag" data-time="12:00:01">12:00</span>
            <span class="injector-time-tag injector-time-tag-now">Сейчас+10с</span>
          </div>
          <div class="injector-schedule-row">
            <input type="text" class="injector-schedule-input" value="12:00:01" maxlength="8" placeholder="ЧЧ:ММ:СС МСК" />
            <button class="injector-modal-btn injector-modal-btn-cancel">Отменить</button>
            <button class="injector-modal-btn injector-modal-btn-schedule">Запланировать</button>
            <button class="injector-modal-btn injector-modal-btn-run">Запустить сейчас</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.injector-modal-close');
  const runBtn = overlay.querySelector('.injector-modal-btn-run');
  const scheduleBtn = overlay.querySelector('.injector-modal-btn-schedule');
  const cancelBtn = overlay.querySelector('.injector-modal-btn-cancel');
  const timeInput = overlay.querySelector('.injector-schedule-input');
  const timeTags = overlay.querySelectorAll('.injector-time-tag');
  const clockEl = overlay.querySelector('.injector-modal-clock');
  const statusEl = overlay.querySelector('.injector-modal-status');

  function readConfigFromForm() {
    const fields = {};
    overlay.querySelectorAll('[data-field]').forEach((el) => {
      const key = el.getAttribute('data-field');
      if (el.type === 'checkbox') {
        fields[key] = el.checked;
      } else if (el.tagName === 'SPAN') {
        fields[key] = el.textContent;
      } else if (el.type === 'number' || ['runUpTo', 'transportType', 'maxSlotRetries', 'slotRetryDelayMs', 'maxRetries', 'retryDelayMs'].includes(key)) {
        fields[key] = Number(el.value);
      } else {
        fields[key] = el.value || (key === 'preferredTime' ? null : el.value);
      }
    });
    if (!fields.preferredTime) fields.preferredTime = null;
    return fields;
  }

  function populateForm(config) {
    const preferredTimeSelect = overlay.querySelector('select[data-field="preferredTime"]');
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement('option');
      opt.value = `${String(h).padStart(2, '0')}:00`;
      opt.textContent = `${String(h).padStart(2, '0')}:00`;
      preferredTimeSelect.appendChild(opt);
    }

    overlay.querySelectorAll('[data-field]').forEach((el) => {
      const key = el.getAttribute('data-field');
      const val = config[key];
      if (el.type === 'checkbox') {
        el.checked = !!val;
      } else if (el.tagName === 'SPAN') {
        el.textContent = val !== undefined && val !== null ? val : '';
      } else {
        el.value = val !== undefined && val !== null ? val : '';
      }
    });
  }

  populateForm(defaultConfig);

  let clockTimer = null;
  function clockTick() {
    clockEl.textContent = `МСК: ${getMSKTime()}`;
    const msLeft = 1000 - new Date().getUTCMilliseconds();
    clockTimer = setTimeout(clockTick, msLeft);
  }
  clockTick();

  function closeModal() {
    clearTimeout(clockTimer);
    clearSchedule();
    overlay.remove();
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  timeTags.forEach((tag) => {
    tag.addEventListener('click', () => {
      if (tag.classList.contains('injector-time-tag-now')) {
        const now = new Date();
        const utcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds() + 10;
        const mskSec = (utcSec + TZ_OFFSET * 3600) % 86400;
        const h = Math.floor(mskSec / 3600);
        const m = Math.floor((mskSec % 3600) / 60);
        const s = mskSec % 60;
        timeInput.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else {
        timeInput.value = tag.getAttribute('data-time');
      }
    });
  });

  scheduleBtn.addEventListener('click', () => {
    const timeStr = timeInput.value.trim();
    if (!timeStr) {
      statusEl.textContent = 'Введите время запуска';
      statusEl.className = 'injector-modal-status injector-modal-status-error';
      return;
    }
    const mskSeconds = parseTime(timeStr);
    if (mskSeconds === null) {
      statusEl.textContent = 'Неверный формат. Используйте HH:MM:SS';
      statusEl.className = 'injector-modal-status injector-modal-status-error';
      return;
    }
    const targetUtcSeconds = mskToUtcSeconds(mskSeconds);
    const config = readConfigFromForm();
    startSchedule(targetUtcSeconds, config, clockEl, statusEl);
    log(`Инжектор запланирован на ${timeStr} МСК`);
  });

  cancelBtn.addEventListener('click', () => {
    clearSchedule();
    statusEl.textContent = '';
    statusEl.className = 'injector-modal-status';
    timeInput.value = '12:00:01';
    log('Расписание отменено');
  });

  runBtn.addEventListener('click', async () => {
    clearSchedule();
    statusEl.textContent = '';
    statusEl.className = 'injector-modal-status';
    const config = readConfigFromForm();
    closeModal();
    runBtn.disabled = true;
    runBtn.textContent = 'Запуск...';
    try {
      await main(config);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Запустить сейчас';
    }
  });

  document.body.appendChild(overlay);
  return { overlay };
}

// ========================================
//  Инициализация
// ========================================

const info = shouldInject(window.location.href);

if (info) {
  const btn = document.createElement("button");
  btn.textContent = "Инжектор";
  btn.className = "custom-plugin-btn";

  btn.addEventListener("click", async () => {
    var actualInfo = shouldInject(window.location.href);
    if (!actualInfo) {
      alert("Не та страница");
      return;
    }

    let params, injectorUrl;

    if (actualInfo.isLocalhost) {
      params = {
        facilityId: '1dae5b1c-e2b3-44a4-848f-df8ce2ddde42',
        vehicleId: 'test-vehicle-id',
        transportType: 1,
      };
      injectorUrl = `https://localhost:8765/injector?facilityId=${params.facilityId}&vehicleId=${params.vehicleId}&reservationId=${actualInfo.reservationId}&transportType=${params.transportType}`;
    } else {
      const apiResponse = await fetch(
        `https://eopp.epd-portal.ru/reservations-api/v1/${actualInfo.reservationId}`,
        {
          credentials: "omit",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "ru,en;q=0.9",
            FacilityMode: "false",
          },
          method: "GET",
          mode: "cors",
          credentials: "include",
        }
      );
      const json = await apiResponse.json();
      params = extractParams(json);
      injectorUrl =
        "https://china.alabai.netcraze.pro/injector?" +
        `facilityId=${params.facilityId}` +
        `&vehicleId=${params.vehicleId}` +
        `&reservationId=${actualInfo.reservationId}` +
        `&transportType=${params.transportType}`;
    }

    const defaultConfig = {
      runUpTo: 4,
      facilityId: params.facilityId,
      vehicleId: params.vehicleId,
      reservationId: actualInfo.reservationId,
      transportType: params.transportType,
      slotDate: new Date().toISOString().split('T')[0],
      mode: "reschedule",
      preferredTime: null,
      autoSolve: false,
      retryOnAllSlotsOccupied: true,
      maxSlotRetries: 3,
      slotRetryDelayMs: 500,
      retryDelayMs: 5000,
      maxRetries: 3,
    };

    createModal(injectorUrl, defaultConfig);
  });

  if (info.isLocalhost) {
    document.body.appendChild(btn);
  } else {
    const selector =
      "body > app-root > div > div.page-wrapper.zit-scrollbar > app-reservations-list-page > div > form > div.page-controls";

    const waitForContainer = () => {
      const container = document.querySelector(selector);
      if (container) {
        container.appendChild(btn);
        return true;
      }
      return false;
    };

    if (!waitForContainer()) {
      const observer = new MutationObserver(() => {
        if (waitForContainer()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
}
