// ========================================
//  INJECTOR - Конфигурация
// ========================================
const CONFIG = {
  // 1=слоты, 2=капча, 3=решение капчи, 4=валидация, 5=отправка
  runUpTo: 4,

  facilityId: '1dae5b1c-e2b3-44a4-848f-df8ce2ddde42',
  vehicleId: 'cbce47c1-5d8b-4bc6-ac11-10eea5338b79',
  reservationId: '23cab97f-16c4-4db5-9b87-0a47159b7fb1',
  transportType: 1,
  slotDate: '2026-04-30',
  mode: 'reschedule',
  preferredTime: null,

  captchaServerUrl: 'https://china.alabai.netcraze.pro',

  autoSolve: true,
  retryOnAllSlotsOccupied: true,
  maxSlotRetries: 5,
  slotRetryDelayMs: 500,
  retryDelayMs: 5000,
  maxRetries: 5,
};

// ========================================
//  Утилиты
// ========================================

const usedSlotIds = new Set();
const isCreateReservation = CONFIG.mode === 'create';

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

function postLocalhost(path, body) {
  return httpRequest('POST', `${CONFIG.captchaServerUrl}${path}`, body);
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

  const url = `/reservations-api/v1/timeslot/AvailableSlots?facilityId=${CONFIG.facilityId}&vehicleId=${CONFIG.vehicleId}&date=${CONFIG.slotDate}&transportType=${CONFIG.transportType}&isCreateReservation=${isCreateReservation}&reservationId=${CONFIG.reservationId}`;

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

  if (CONFIG.preferredTime) {
    const preferredSlot = availableSlots.find((slot) => slot.time === CONFIG.preferredTime);
    if (preferredSlot) {
      log(`Найден предпочтительный слот: ${preferredSlot.slotCaption}`);
      usedSlotIds.add(preferredSlot.id);
      return preferredSlot;
    }
    log(`Предпочтительный слот ${CONFIG.preferredTime} недоступен, выбираем по другому критерию`);
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
    facilityId: CONFIG.facilityId,
    timeSlotData: `${CONFIG.slotDate}T${slotData.time}.000Z`,
    reservationId: CONFIG.reservationId,
    encryptedTso: null,
  };

  const response = await httpRequest('POST', '/reservations-api/v1/captcha', payload);
  log('Капча сгенерирована');
  return response;
}

// ========================================
//  Этап 3 — Решение капчи (наш сервер)
// ========================================

async function solveCaptcha(captchaData) {
  log('Этап 3: запрос к нашему серверу /solve-captcha');

  const payload = {
    ...captchaData,
    auto_solve: CONFIG.autoSolve,
  };

  const response = await postLocalhost('/solve-captcha', payload);
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
    facilityId: CONFIG.facilityId,
    timeSlotData: `${CONFIG.slotDate}T${slotData.time}.000Z`,
    reservationId: CONFIG.reservationId,
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
    reservationRequestId: CONFIG.reservationId,
    timeslot: `${CONFIG.slotDate.split('-').slice(1).reverse().join('.')}, ${slotData.slotCaption}`,
    date: CONFIG.slotDate,
    transportType: CONFIG.transportType,
    intervalIndex: slotData.intervalIndex,
    facilityId: CONFIG.facilityId,
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
    reservationId: CONFIG.reservationId,
    facilityId: CONFIG.facilityId,
    arrivalDatePlan: CONFIG.slotDate,
    intervalIndex: slotData.intervalIndex,
    transportType: CONFIG.transportType,
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

  if (CONFIG.runUpTo < 2) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const captchaResponse = await retryOn429(
    () => generateCaptcha(slotData),
    CONFIG.maxRetries,
    CONFIG.retryDelayMs
  );

  if (CONFIG.runUpTo < 3) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const solvedAnswer = await solveCaptcha(captchaResponse);
  log('Ответ от нашего сервера', solvedAnswer);

  if (CONFIG.runUpTo < 4) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const validationResponse = await retryOn429(
    () => validateCaptcha(captchaResponse, slotData, solvedAnswer),
    CONFIG.maxRetries,
    CONFIG.retryDelayMs
  );

  if (CONFIG.runUpTo < 5) {
    log('Остановка по конфигу runUpTo');
    return null;
  }

  const submitFn = isCreateReservation ? submitCreate : submitReschedule;
  const submitResponse = await retryOn429(
    () => submitFn(slotData, validationResponse),
    CONFIG.maxRetries,
    CONFIG.retryDelayMs
  );

  return submitResponse;
}

async function main() {
  log('=== Старт скрипта (runUpTo: ' + CONFIG.runUpTo + ') ===');

  try {
    const slotsResponse = await getAvailableSlots();
    let slotRetryCount = 0;

    while (slotRetryCount <= CONFIG.maxSlotRetries) {
      try {
        const result = await runFromStage2(slotsResponse);
        if (result !== null) {
          log('=== Скрипт завершён успешно ===', result);
        }
        return;
      } catch (err) {
        const isAllSlotsOccupied = err && err.body && err.body.includes('AllSlotsOccupiedOnInterval');

        if (isAllSlotsOccupied && CONFIG.retryOnAllSlotsOccupied && slotRetryCount < CONFIG.maxSlotRetries) {
          slotRetryCount++;
          log(`AllSlotsOccupiedOnInterval — пробуем другой слот (попытка ${slotRetryCount}/${CONFIG.maxSlotRetries})`);
          await new Promise((r) => setTimeout(r, CONFIG.slotRetryDelayMs));
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

main();
