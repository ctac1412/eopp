function extractParams(json) {
  const vehicleId = json.vehicleData[0].vehicleId;
  const facilityId = json.facilityId;
  const transportType = json.typeOfTransportation;
  return { vehicleId, facilityId, transportType };
}

function shouldInject(pageUrl) {
  const match = pageUrl.match(/\/reservations\/reservation\/([a-f0-9-]{36})\/edit/);
  if (match) {
    return { reservationId: match[1] };
  }
  return null;
}

// ========================================
//  Утилиты
// ========================================

const usedSlotIds = new Set();
let currentConfig = null;

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
  const url = `/reservations-api/v1/timeslot/AvailableSlots?facilityId=${currentConfig.facilityId}&vehicleId=${currentConfig.vehicleId}&date=${currentConfig.slotDate}&transportType=${currentConfig.transportType}&isCreateReservation=${isCreateReservation}&reservationId=${currentConfig.reservationId}`;

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

function createModal() {
  const overlay = document.createElement('div');
  overlay.className = 'injector-modal-overlay';
  overlay.innerHTML = `
    <div class="injector-modal">
      <div class="injector-modal-header">
        <span class="injector-modal-title">Конфигурация инжектора</span>
        <button class="injector-modal-close">&times;</button>
      </div>
      <div class="injector-modal-body">
        <textarea class="injector-modal-textarea" rows="16"></textarea>
      </div>
      <div class="injector-modal-footer">
        <button class="injector-modal-btn injector-modal-btn-run">Запустить</button>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.injector-modal-close');
  const runBtn = overlay.querySelector('.injector-modal-btn-run');
  const textarea = overlay.querySelector('.injector-modal-textarea');

  function closeModal() {
    overlay.remove();
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  runBtn.addEventListener('click', async () => {
    try {
      const config = JSON.parse(textarea.value);
      closeModal();
      runBtn.disabled = true;
      runBtn.textContent = 'Запуск...';
      await main(config);
    } catch (err) {
      alert('Ошибка парсинга JSON: ' + err.message);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Запустить';
    }
  });

  document.body.appendChild(overlay);
  return { overlay, textarea };
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
    const apiResponse = await fetch(
      `https://eopp.epd-portal.ru/reservations-api/v1/${info.reservationId}`,
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
    const params = extractParams(json);

    const url =
      "https://china.alabai.netcraze.pro/injector?" +
      `facilityId=${params.facilityId}` +
      `&vehicleId=${params.vehicleId}` +
      `&reservationId=${info.reservationId}` +
      `&transportType=${params.transportType}`;

    window.open(url, "_blank");

    const defaultConfig = {
      runUpTo: 4,
      facilityId: params.facilityId,
      vehicleId: params.vehicleId,
      reservationId: info.reservationId,
      transportType: params.transportType,
      slotDate: new Date().toISOString().split('T')[0],
      mode: "reschedule",
      preferredTime: null,
      autoSolve: true,
      retryOnAllSlotsOccupied: true,
      maxSlotRetries: 5,
      slotRetryDelayMs: 500,
      retryDelayMs: 5000,
      maxRetries: 5,
    };

    const { overlay, textarea } = createModal();
    textarea.value = JSON.stringify(defaultConfig, null, 2);
  });

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
