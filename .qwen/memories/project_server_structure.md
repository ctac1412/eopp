---
name: Структура prod сервера и БД
description: Файловая структура на сервере 45.12.75.110, используемая БД, правила WAL mode, push/pull пути
type: project
---

**Структура на сервере (`/opt/eopp/`):**
```
/opt/eopp/
├── data/
│   ├── api_keys.db        ← основная БД (используется сервисом)
│   ├── api_keys.db-shm    ← SQLite WAL (нужен сервису, не удалять)
│   ├── api_keys.db-wal    ← SQLite WAL (нужен сервису, не удалять)
│   └── captcha_examples/
├── plugins/
├── certs/
├── docker-compose.yml
└── nginx-default.conf
```

**Push-data пушит:** `api_keys.db*` + `captcha_examples/` (из `prod/data/`), `my.pem` исключён. **Плагины пушатся из `plugins/`** (корень проекта) → `/opt/eopp/plugins/`.

**Pull-data:** скачивает `data/` с сервера → `prod/data/`.

**Бэкапы:** `prod/backups/<timestamp>/` содержит `data/` + `plugins/`.

**Важно:** WAL-файлы (`.db-wal`, `.db-shm`) критичны — без них SQLite может потерять данные.
