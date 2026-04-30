# Injector Script

Скрипт для внедрения в чужую страницу через консоль браузера. Автоматизирует цепочку: получение слотов → капча → решение капчи → валидация → отправка данных.

## Структура

```
injector/
├── injector.js   # Основной скрипт (один файл, готов к вставке в консоль)
└── plan.md       # Этот файл
```

## Конфигурация

Все параметры задаются в объекте `CONFIG` в начале `injector.js`:

- `runUpTo` — до какого этапа запускать (1-5)
- `facilityId`, `vehicleId`, `transportType`, `slotDate`, `isCreateReservation`, `reservationId` — данные запроса
- `preferredTime` — предпочтительное время слота (null = автовыбор)
- `captchaServerUrl` — URL нашего локального сервера (по умолчанию `http://127.0.0.1:8765`)
- `retryDelayMs` — задержка перед повтором при 429 (5000мс)
- `maxRetries` — макс. количество повторов при 429 (5)

## Этапы

1. **getAvailableSlots** — GET `/reservations-api/v1/timeslot/AvailableSlots`
2. **selectBestSlot** — preferredTime → max count → random, трекинг usedSlotIds
3. **generateCaptcha** — POST `/reservations-api/v1/captcha` (с retry 429)
4. **solveCaptcha** — POST к нашему серверу `/captcha`
5. **validateCaptcha** — POST `/reservations-api/v1/captcha-validate` (с retry 429)
6. **submitData** — POST `/reservations-api/v1/Reschedule` (с retry 429)

## Использование

1. Отредактировать `CONFIG` в `injector.js`
2. Скопировать содержимое файла в консоль браузера на целевой странице
3. Или загрузить через `<script src="...">`

## План развития

- [x] Определить реальные URL эндпоинтов чужой страницы
- [x] Реализовать алгоритм `selectBestSlot`
- [ ] Добавить парсинг реальных ответов (структура TBD)
- [ ] Добавить обработку ошибок по этапам
- [ ] Логирование в UI (опционально)
