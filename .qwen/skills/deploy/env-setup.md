# EOPP Deploy — Environment Setup

Настройка окружения для деплоя: переменные, SSH, серверная инфраструктура.

---

## 1. `.env.deploy` — Конфигурация деплоя

**Путь:** `scripts/.env.deploy` (gitignored)

### Обязательные переменные

| Переменная | Описание | Пример |
|------------|----------|--------|
| `SSH_HOST` | IP или домен сервера | `45.12.75.110` |

### Необязательные переменные (с дефолтами)

| Переменная | Default | Описание |
|------------|---------|----------|
| `SSH_USER` | `root` | Пользователь SSH |
| `SSH_PORT` | `22` | Порт SSH |
| `IMAGE_NAME` | `eopp` | Имя Docker-образа |
| `IMAGE_TAG` | `latest` | Тег образа |
| `REMOTE_DIR` | `/opt/eopp` | Директория на сервере |
| `LOCAL_BACKUP_DIR` | `./backups` | Локальная директория бэкапов |
| `HEALTH_CHECK_RETRIES` | `30` | Попыток health check |
| `HEALTH_CHECK_INTERVAL` | `5` | Секунд между попытками |

### Пример файла

```env
# scripts/.env.deploy
SSH_HOST=45.12.75.110
SSH_USER=root
SSH_PORT=22
```

---

## 2. SSH — Аутентификация

Скрипт использует OpenSSH из Windows. Поддерживаются оба метода:

### Парольная аутентификация

При первом подключении скрипт запросит пароль. SSH agent не используется.

### Аутентификация по ключу (рекомендуется)

```powershell
# Генерация ключа (если нет)
ssh-keygen -t ed25519 -C "eopp-deploy"

# Копирование на сервер
ssh-copy-id root@45.12.75.110

# Проверка
ssh root@45.12.75.110 "echo 'SSH OK'"
```

**Преимущества:**
- Не нужно вводить пароль каждый раз
- Автоматический деплой без интерактивности
- Безопаснее пароля

---

## 3. Серверная инфраструктура

### Требования к серверу

- **OS:** Linux (Ubuntu/Debian推荐)
- **Docker:** 24+ с Docker Compose V2
- **Nginx:** 1.24+ (для reverse proxy)
- **Порты:** 80, 443 (nginx), 8765 (app), 8080 (sqlite-web)
- **Диск:** минимум 10GB свободного места
- **RAM:** минимум 1GB

### Установка Docker на сервер

```bash
# На сервере (SSH)
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

### Настройка Nginx

**Установить:**
```bash
apt install nginx apache2-utils
```

**Создать базовую аутентификацию:**
```bash
htpasswd -c /etc/nginx/.htpasswd admin
# Ввести пароль
```

**Скопировать конфиг:**
```bash
scp nginx-default.conf root@45.12.75.110:/etc/nginx/sites-available/eopp
ssh root@45.12.75.110 "ln -s /etc/nginx/sites-available/eopp /etc/nginx/sites-enabled/"
ssh root@45.12.75.110 "nginx -t && systemctl reload nginx"
```

### SSL сертификаты

**Вариант 1: Self-signed (генерируются автоматически)**

Приложение само генерирует self-signed сертификаты при первом запуске.

**Вариант 2: Let's Encrypt (рекомендуется для prod)**

```bash
# На сервере
apt install certbot
certbot certonly --standalone -d eopp.example.com

# Скопировать в директорию приложения
cp /etc/letsencrypt/live/eopp.example.com/fullchain.pem /opt/eopp/certs/cert.pem
cp /etc/letsencrypt/live/eopp.example.com/privkey.pem /opt/eopp/certs/key.pem

# Обновить nginx конфиг (указать пути к cert.pem/key.pem)
```

---

## 4. sqlite-web на prod

**Путь:** `https://45.12.75.110:8081/sqlite-web/`

### Конфигурация

sqlite-web работает через `docker-compose.prod.yml` на host network:

```yaml
services:
  sqlite-web:
    image: coleifer/sqlite-web
    network_mode: "host"
    volumes:
      - ./data:/data
    command: -P changeme -u /sqlite-web/ /data/api_keys.db
```

### ⚠️ Проблема с сохранением пароля

Браузеры **не предлагают сохранять пароли для IP-адресов** (`https://45.12.75.110`). Это поведение безопасности.

**Решения:**
1. **Привязать домен к IP** — добавить в `/etc/hosts` или DNS:
   ```
   45.12.75.110  eopp.example.com
   ```
   Тогда браузер будет сохранять пароль для домена.

2. **Использовать менеджер паролей** — вручную сохранить пароль в KeePass/Bitwarden.

3. **Изменить пароль** — по умолчанию `changeme`, изменить в `.env.server`.

---

## 5. `.env.server` — Переменные приложения

**Путь:** `/opt/eopp/.env.server` (на сервере)

Из ` .env.server.example`:

```env
SERVER_URL=https://45.12.75.110:8765
SERVER_HOST=45.12.75.110
SQLITE_WEB_PASSWORD=changeme
```

**Как создать на сервере:**
```bash
ssh root@45.12.75.110 "cat > /opt/eopp/.env.server << 'EOF'
SERVER_URL=https://45.12.75.110:8765
SERVER_HOST=45.12.75.110
SQLITE_WEB_PASSWORD=changeme
EOF"
```

---

## 6. Проверка готовности

Перед первым деплоем:

```powershell
# 1. Проверить .env.deploy
Test-Path scripts/.env.deploy

# 2. Проверить SSH
ssh root@45.12.75.110 "echo 'SSH OK'"

# 3. Проверить Docker на сервере
ssh root@45.12.75.110 "docker --version"
ssh root@45.12.75.110 "docker compose version"

# 4. Проверить nginx
ssh root@45.12.75.110 "nginx -t"

# 5. Проверить место
ssh root@45.12.75.110 "df -h /opt"
```

---

## 7. Безопасность

### Что в gitignore

- `scripts/.env.deploy` — SSH credentials
- `data/` — БД, test cases
- `certs/` — SSL ключи
- `backups/` — локальные бэкапы
- `.env.server` — серверные переменные

### Рекомендации

1. **SSH ключ > пароль** — использовать аутентификацию по ключу
2. **Изменить пароль sqlite-web** — `changeme` только для разработки
3. **Let's Encrypt** — self-signed сертификаты показывают warning в браузере
4. **Бэкапы** — хранить не только локально, но и в облаке
5. ** Firewall** — открыть только порты 80, 443, 22
