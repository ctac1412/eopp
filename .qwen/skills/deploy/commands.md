# EOPP Deploy — Commands Reference

Полный справочник команд деплоя с примерами и пояснениями.

---

## Основные команды

### `make deploy` — Полный деплой

**Что делает:**
1. Проверяет SSH-соединение
2. Проверяет локальный Docker
3. Скачивает бэкап `data/` и `plugins/` с сервера
4. Собирает фронтенд (`npm run build`)
5. Собирает Docker-образ
6. Экспортирует образ в tar → SCP → загружает на сервер
7. Создаёт директории на сервере
8. Генерирует `docker-compose.yml` на сервере
9. Запускает контейнер
10. Проверяет health (30 попыток, 5с интервал)
11. При failure — автоматический rollback

**Время:** ~5-15 минут (зависит от скорости сети)

**Вывод при успехе:**
```
=========================================
[OK] Deploy completed successfully!
[OK] Backup saved to: ./backups/20260519_093045
=========================================
```

---

### `make deploy-pull-data` — Скачать данные

**Что делает:**
- Скачивает `data/` с сервера в `backups/pulled-data/data/`

**Когда использовать:**
- Нужно проверить БД локально
- Хочется восстановить данные из прода
- Отладка проблем с данными

**Пример:**
```powershell
make deploy-pull-data
# Данные в: backups/pulled-data/data/
```

---

### `make deploy-push-data` — Загрузить данные

**Что делает:**
- Загружает локальные `data/` и `plugins/` на сервер

**Когда использовать:**
- Перенос данных с dev на prod
- Восстановление данных из локального бэкапа
- Загрузка плагинов

**⚠️ ВНИМАНИЕ:** Перезаписывает данные на сервере!

---

### `make deploy-logs` — Стрим логов

**Что делает:**
- Подключается к серверу и стримит логи контейнера

**Когда использовать:**
- Health check failed — нужно понять почему
- Проверка работы после деплоя
- Отладка ошибок

**Пример вывода:**
```
eopp-eopp-prod-1  | INFO:     Started server process [1]
eopp-eopp-prod-1  | INFO:     Waiting for application startup.
eopp-eopp-prod-1  | INFO:     Application startup complete.
eopp-eopp-prod-1  | INFO:     Uvicorn running on https://0.0.0.0:8765
```

**Остановить:** `Ctrl+C`

---

### `make deploy-backup` — Бэкап

**Что делает:**
- Скачивает `data/` и `plugins/` в `backups/TIMESTAMP/`

**Когда использовать:**
- Перед ручными изменениями на сервере
- Для архивирования
- Перед миграцией БД

**Структура бэкапа:**
```
backups/
└── 20260519_093045/
    ├── data/
    │   ├── api_keys.db
    │   └── test_cases/
    └── plugins/
        └── my-helper-v1.2.3.crx
```

---

### `make deploy-rollback` — Откат

**Что делает:**
1. Находит предыдущий образ (не-latest)
2. Останавливает контейнер
3. Меняет `image:` в compose на предыдущий
4. Запускает контейнер

**⚠️ Требование:** На сервере должно быть минимум 2 образа

**Когда использовать:**
- Health check failed при деплое (автоматически)
- После деплоя обнаружены баги
- Нужно быстро вернуть рабочую версию

**Пример:**
```
[WARN] Rolling back to previous image...
[INFO] Rolling back to eopp:1.2.0...
[OK] Rolled back to eopp:1.2.0
```

---

## Локальные Docker команды

| Make | Команда | Описание |
|------|---------|----------|
| `make build-prod` | `docker compose build` | Собрать образ локально |
| `make start-prod` | `docker compose up -d` | Запустить локально (prod compose) |
| `make stop-prod` | `docker compose down` | Остановить |
| `make restart-prod` | `stop + start` | Перезапустить |
| `make rebuild-prod` | `up -d --build` | Пересобрать и запустить |
| `make logs-prod` | `docker compose logs -f` | Логи локального контейнера |

---

## SSH команды (вручную)

```powershell
# Подключиться к серверу
ssh root@45.12.75.110

# Проверить статус контейнера
ssh root@45.12.75.110 "cd /opt/eopp && docker compose ps"

# Перезапустить контейнер
ssh root@45.12.75.110 "cd /opt/eopp && docker compose restart"

# Остановить контейнер
ssh root@45.12.75.110 "cd /opt/eopp && docker compose down"

# Посмотреть логи
ssh root@45.12.75.110 "cd /opt/eopp && docker compose logs --tail=50"

# Проверить место на диске
ssh root@45.12.75.110 "df -h"

# Посмотреть Docker образы
ssh root@45.12.75.110 "docker images"

# Удалить старые образы
ssh root@45.12.75.110 "docker image prune -af"
```

---

## Makefile deploy-таргеты

Из `Makefile`:

```makefile
deploy:
	@powershell -ExecutionPolicy Bypass -File ./scripts/deploy.ps1 deploy

deploy-pull-data:
	@powershell -ExecutionPolicy Bypass -File ./scripts/deploy.ps1 pull-data

deploy-logs:
	@powershell -ExecutionPolicy Bypass -File ./scripts/deploy.ps1 logs

deploy-backup:
	@powershell -ExecutionPolicy Bypass -File ./scripts/deploy.ps1 backup

deploy-rollback:
	@powershell -ExecutionPolicy Bypass -File ./scripts/deploy.ps1 rollback

deploy-push-data:
	@powershell -ExecutionPolicy Bypass -File ./scripts/deploy.ps1 push-data
```
