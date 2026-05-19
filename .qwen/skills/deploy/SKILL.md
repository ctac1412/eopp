# EOPP — Production Deploy Skill

**Назначение:** Деплой EOPP сервиса на production-сервер через SSH, управление данными, бэкапы и откаты.

---

## Быстрый старт

```powershell
# Полный деплой
make deploy

# Или напрямую
.\scripts\deploy.ps1 deploy
```

---

## Доступные команды

| Команда | Make | Описание |
|---------|------|----------|
| Проверка готовности | `make deploy-preflight` | SSH, Docker, сервер — всё OK? |
| Полный деплой | `make deploy` | Бэкап → сборка → трансфер → деплой → health check |
| Скачать данные | `make deploy-pull-data` | Скопировать `data/` с сервера локально |
| Загрузить данные | `make deploy-push-data` | Загрузить `data/` и `plugins/` на сервер |
| Стрим логов | `make deploy-logs` | Подключиться к логам контейнера |
| Бэкап | `make deploy-backup` | Скачать `data/` и `plugins/` в `backups/TIMESTAMP/` |
| Откат | `make deploy-rollback` | Откатиться к предыдущему образу |

### Прямой запуск скриптов

```powershell
.\scripts\deploy\preflight.ps1
.\scripts\deploy\deploy.ps1
.\scripts\deploy\backup.ps1
.\scripts\deploy\pull-data.ps1
.\scripts\deploy\push-data.ps1
.\scripts\deploy\logs.ps1
.\scripts\deploy\rollback.ps1
```

---

## Структура скриптов

```
scripts/
├── deploy.ps1            # Wrapper для обратной совместимости (deprecated)
├── .env.deploy           # Конфигурация SSH (gitignored)
└── deploy/
    ├── config.ps1        # Ядро: .env.deploy, SSH/SCP, Log-*, Remote-Exec, Check-*
    ├── deploy.ps1        # Полный деплой
    ├── preflight.ps1     # Проверка готовности
    ├── backup.ps1        # Бэкап data/ и plugins/
    ├── pull-data.ps1     # Скачать data/ с сервера
    ├── push-data.ps1     # Загрузить data/ и plugins/ на сервер
    ├── logs.ps1          # Стрим логов контейнера
    └── rollback.ps1      # Откат к предыдущему образу
```

Каждый скрипт начинает с `. "$PSScriptRoot\config.ps1"` — это загружает `.env.deploy`, настраивает SSH/SCP, логирование и helper-функции.

---

## Требования

1. **`.env.deploy`** — файл в `scripts/.env.deploy` (НЕ коммитится)
2. **Docker Desktop** — запущен локально
3. **OpenSSH** — установлен (`ssh.exe`, `scp.exe` в `C:\Windows\System32\OpenSSH\`)
4. **Node.js** — для сборки фронтенда
5. **SSH-доступ** к серверу (пароль или ключ)

### Формат `.env.deploy`

```env
SSH_HOST=45.12.75.110        # ОБЯЗАТЕЛЬНО — IP или домен сервера
SSH_USER=root                 # По умолчанию: root
SSH_PORT=22                   # По умолчанию: 22
IMAGE_NAME=eopp               # По умолчанию: eopp
IMAGE_TAG=latest              # По умолчанию: latest
REMOTE_DIR=/opt/eopp          # По умолчанию: /opt/eopp
LOCAL_BACKUP_DIR=./backups    # По умолчанию: ./backups
HEALTH_CHECK_RETRIES=30       # По умолчанию: 30
HEALTH_CHECK_INTERVAL=5       # По умолчанию: 5 (секунды)
```

---

## Workflow деплоя

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Check-SSH ──────────► Проверка соединения                  │
│  2. Check-Docker ───────► Проверка локального Docker            │
│  3. Backup-RemoteData ──► Скачать data/ и plugins/             │
│  4. Build-Frontend ─────► npm run build в frontend/            │
│  5. Build-DockerImage ──► docker build -t eopp:latest .        │
│  6. Transfer-Image ─────► docker save → scp → docker load     │
│  7. Setup-RemoteDirs ───► mkdir data/ certs/ plugins/          │
│  8. Generate-Compose ───► Создать docker-compose.yml на сервере│
│  9. Deploy-Container ───► docker compose up -d                 │
│ 10. Test-Health ────────► Проверка running + HTTP 200/301/302  │
│     ├── OK ─────────────► Deploy completed!                    │
│     └── FAIL ───────────► Do-Rollback (к предыдущему образу)   │
└─────────────────────────────────────────────────────────────────┘
```

### Health Check

- **Попытки:** 30 (настраивается через `HEALTH_CHECK_RETRIES`)
- **Интервал:** 5 секунд (настраивается через `HEALTH_CHECK_INTERVAL`)
- **Проверка 1:** `docker compose ps` → статус `running`
- **Проверка 2:** `curl -sk https://localhost:8765/` → HTTP 200/301/302
- **Максимум времени:** 150 секунд (2.5 мин)

### Rollback

- Ищет предыдущий образ: `docker images | grep eopp | grep -v 'latest' | head -1`
- **Требование:** минимум 2 образа на сервере
- Если只有一个 образ — rollback невозможен

---

## Архитектура деплоя

### Локальная машина (Windows)
```
D:\Projects\eopp\
├── scripts\deploy.ps1      # Скрипт деплоя
├── scripts\.env.deploy     # Конфиг (gitignored)
├── frontend\               # React SPA (собирается при деплое)
├── Dockerfile              # Multi-stage build
└── backups\                # Локальные бэкапы (gitignored)
```

### Production сервер (Linux)
```
/opt/eopp/
├── docker-compose.yml      # Генерируется скриптом (inline)
├── data/                   # БД api_keys.db, test cases
├── certs/                  # SSL сертификаты (self-signed)
└── plugins/                # CRX файлы плагинов
```

### Nginx (настраивается вручную)
- **HTTP :80** — reverse proxy для API, redirect на HTTPS
- **HTTPS :443** — basic auth + reverse proxy на `https://127.0.0.1:8765`
- **/sqlite-web/** — прокси на sqlite-web (свой пароль)

---

## Troubleshooting

### Ошибка: "SSH_HOST is required"
→ Создать `scripts/.env.deploy` с `SSH_HOST=<ip>`

### Ошибка: "Docker is not running"
→ Запустить Docker Desktop

### Ошибка: "Cannot connect to <host>"
→ Проверить:
  - SSH_HOST правильный
  - SSH порт открыт
  - SSH ключ/пароль настроены

### Ошибка: "No previous image found for rollback"
→ На сервере только один образ. Сначала запустите полный деплой, чтобы появился предыдущий образ.

### Health check failed
→ Проверить логи: `make deploy-logs`
→ Возможные причины:
  - Порт 8765 занят
  - SSL сертификаты не сгенерированы
  - БД повреждена

### Бэкап занимает слишком много времени
→ `data/` может быть большим. Используйте `make deploy-pull-data` для выборочной синхронизации.

---

## Важные нюансы

1. **Compose генерируется inline** — скрипт НЕ использует локальные `docker-compose.yml` или `docker-compose.prod.yml`. Он создаёт минимальный compose-файл на сервере через heredoc.

2. **Передача образа через tar** — не используется Docker Registry. Образ экспортируется в tar (~500MB) и передаётся по SCP.

3. **Nginx не управляется скриптом** — предполагается что nginx уже настроен. Конфиг: `nginx-default.conf`.

4. **sqlite-web на prod** — работает на host network (порт 8080), защищён встроенным паролем (`-P`), не через nginx basic auth.

5. **Бэкапы локальные** — хранятся на машине разработчика в `backups/`, НЕ на сервере.

6. **Нет атомарного деплоя** — контейнер перезапускается с даунтаймом (~5-15 сек).

---

## Связанные файлы

| Файл | Назначение |
|------|-----------|
| `scripts/deploy.ps1` | Основной скрипт деплоя |
| `scripts/.env.deploy` | Конфигурация SSH (gitignored) |
| `Dockerfile` | Multi-stage Docker build |
| `docker-compose.prod.yml` | Prod compose (для локального тестирования) |
| `nginx-default.conf` | Nginx конфиг для сервера |
| `.env.server.example` | Template переменных сервера |
| `Makefile` | Таргеты `deploy*` |
