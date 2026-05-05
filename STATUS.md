# Статус выполнения задач

Последнее обновление: 2026-05-02T00:00:00Z

## Агент 1: Browser Extension — UI и авторизация
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| 1.1.1 | Закрытие AuthGate без ввода ключа | ✅ готово | Добавлен `onClose` prop + кнопка `×` в overlay |
| 1.1.2 | Скрытие модалки до авторизации | ✅ готово | Modal рендерит ConfigForm/LiveLog/Scheduler только если `isAuthenticated` |
| 1.1.3 | Кнопка выхода / смена ключа | ✅ готово | Кнопка «Выйти» в header, вызывает `clearAuthKey` + `updateField('apiKey', '')` |
| 1.2.1 | Восстановление запуска по таймеру | ✅ готово | Исправлено: `currentUtcSec` теперь включает миллисекунды, условие `remaining < 1` вместо `===` |
| 1.2.2 | Пресеты 10:00:00.5 / 12:00:00.5 | ✅ готово | Теги и onClick обновлены на `.5` |
| 1.2.3 | Удаление строки «Осталось:» | ✅ готово | Заменено на «Запуск через {countdown}» |

## Агент 1 (продолжение): Browser Extension — задачи A.1–A.6
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| A.1 | Fullscreen by default | ✅ готово | `isFullscreen: true` в store.ts |
| A.2 | Remove scheduled status from footer | ✅ готово | Удалён countdown display из Scheduler.tsx, hook остаётся рабочим |
| A.3 | Auth key + logout in 4th column | ✅ готово | Убраны из Modal header, добавлены в ConfigForm "Общие настройки" |
| A.4 | Unify injector_auth_key и injector_api_key | ✅ готово | localStorage migration + unified key во всех операциях |
| A.5 | admin_token from kiosk_api_key | ✅ готово | Все запросы используют unified apiKey из config |
| A.6 | Improve timer precision to ~100ms | ✅ готово | Tick каждые 50ms, formatCountdown с 2 десятичными знаками |

## Агент 2: React Frontend — Фронтенд сервера
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| 2.1.1 | Исправление 401 в UsageHistory | ✅ готово | Убран `/usage-log` из PROTECTED_PATHS, добавлена обработка ошибок |
| 2.2.1 | Стили кнопок-табов | ✅ готово | Градиент + bottom accent border для активного таба |
| 2.3.1 | Idle-состояние вкладки капчи | ✅ готово | Анимированный спиннер + пульсирующий текст |

## Агент 3: Backend — Python сервер
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| 3.1.1 | Страница стримов в админке | ✅ готово | `GET /admin/streams`, `sse_connections` tracking, tab in AdminPage |
| 3.2.1 | Счётчик тесткейсов | ✅ готово | `GET /admin/test-stats`, tab in AdminPage |
| 3.2.2 | Результаты последнего бенчмарка | ✅ готово | `POST /admin/benchmark`, cached 5min, tab in AdminPage |
| 3.3.1 | Trigger-test под api_key клиента | ✅ готово | `POST /trigger-test` accepts `api_key` in body, `send_test_cases_with_key()` |
| 3.4.1 | Обязательный api_key для SSE | ✅ готово | `GET /stream` requires `api_key`, returns 401 if missing/invalid |
| 3.4.2 | Проверка фронтендов на api_key | ✅ готово | useSSE.js already passed api_key, added 401 guard; extension doesn't use SSE |

## Агент 4: Frontend + Backend — SSE, Layout, History
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| B.1 | SSE connection errors on UI | ✅ готово | sseError в store, StatusBar badge, useSSE error handling |
| B.2 | Fixed log height in kiosk page | ✅ готово | captcha-content-area, fixed heights |
| B.3 | Logs button in history | ✅ готово | Expandable logs column in UsageHistory |
| B.4 | Single stream per API key | ✅ готово | Backend disconnect old, frontend handle "disconnected" |

## Round 3 — Дополнительные задачи
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| C.1 | Логи в истории — стили как в админке | ✅ готово | admin-plugin-logs-cell/wrapper в UsageHistory |
| C.2 | Фиксированная высота captcha-idle | ✅ готово | min-height: 260px в main.css |
| C.3 | Тест триггер — подставление резерва | ✅ готово | Input + зелёная кнопка ▶ в StatusBar |
| C.4 | Сохранение режима окна модалки | ✅ готово | localStorage injector_fullscreen |
| C.5 | Сохранение настроек по reservationId | ✅ готово | Auto-save в updateField, loadSavedConfig, кнопка сброса |
| C.6 | Создание брони — slotDate сегодня | ✅ готово | addDays(0) вместо addDays(14) |

## Round 4 — UI + Логирование
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| D.1 | API ключ + сброс в модалке | ✅ готово | Отдельная секция API ключ, иконка ↺ сброса |
| D.2 | Стили кнопок Mock responses | ✅ готово | injector-mock-btn + модификаторы |
| D.3 | LiveLog правая колонка | ✅ готово | .injector-log-sidebar, всегда виден |
| D.4.1 | POST /register-usage | ✅ готово | Новый эндпоинт, RegisterUsageBody |
| D.4.2 | registerUsage() в main() | ✅ готово | usageLogId доступен с начала скрипта |
| D.4.3 | solve-captcha принимает usage_log_id | ✅ готово | Использует существующий ID |
| D.4.4 | throw при исчерпании ретраев | ✅ готово | failUsage() вызывается всегда |
| D.5 | captcha_id необязательный | ✅ готово | Отображается как '—' если отсутствует |

## Round 5 — История и стримы
| # | Задача | Статус | Примечания |
|---|--------|--------|------------|
| E.1 | ID log в истории | ✅ готово | Колонка "ID" в UsageHistory, .admin-history-id CSS |
| E.2 | Конфиг запуска в БД | ✅ готово | ALTER TABLE config_json, RegisterUsageBody, sanitizeConfig, list_usages |
| E.3 | Раскрытие логов как в админке | ✅ готово | Кнопка в <td>, раскрытие в <tr> с colSpan=8 |
| E.4 | Блокировка нового стрима | ✅ готово | Старое не отключается, новый получает SSE "disconnected" |

## Легенда
- ⏳ в очереди
- 🔧 в работе
- ✅ готово
- ❌ ошибка / блокнёр
- ⏸️ отменено
