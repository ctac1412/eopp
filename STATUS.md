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

## Легенда
- ⏳ в очереди
- 🔧 в работе
- ✅ готово
- ❌ ошибка / блокнёр
- ⏸️ отменено
