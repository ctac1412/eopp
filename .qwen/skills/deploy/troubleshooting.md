# EOPP Deploy — Troubleshooting

Решение типичных проблем при деплое.

---

## SSH проблемы

### "Cannot connect to root@X.X.X.X"

**Причины:**
1. Неверный IP/домен
2. SSH порт закрыт firewall
3. SSH сервис не запущен на сервере
4. Неверный пользователь

**Решение:**
```powershell
# Проверить связь
ping 45.12.75.110

# Проверить порт
Test-NetConnection -ComputerName 45.12.75.110 -Port 22

# Проверить SSH вручную
ssh -v root@45.12.75.110

# На сервере проверить SSH
ssh root@45.12.75.110 "systemctl status sshd"
```

### "Permission denied (publickey,password)"

**Причины:**
1. Неверный пароль
2. SSH ключ не добавлен на сервер
3. SSH конфиг запрещает парольную аутентификацию

**Решение:**
```powershell
# Для парольной аутентификации — проверить пароль
ssh root@45.12.75.110

# Для ключевой — скопировать ключ
ssh-copy-id root@45.12.75.110

# Или вручную добавить ключ
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@45.12.75.110 "cat >> ~/.ssh/authorized_keys"
```

### "Host key verification failed"

**Причина:** Изменился host key сервера (перестановка ОС, MITM-атака)

**Решение:**
```powershell
# Удалить старый ключ
ssh-keygen -R 45.12.75.110

# Подключиться заново (принять новый ключ)
ssh root@45.12.75.110
```

---

## Docker проблемы

### "Docker is not running"

**Причина:** Docker Desktop не запущен

**Решение:**
```powershell
# Запустить Docker Desktop
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Подождать 30-60 секунд
Start-Sleep -Seconds 30

# Проверить
docker info
```

### "docker compose" не recognised

**Причина:** Docker Compose V2 не установлен

**Решение:**
```powershell
# Проверить версию
docker compose version

# Если ошибка — обновить Docker Desktop
# Или установить отдельно: https://docs.docker.com/compose/install/
```

### Docker build занимает слишком много времени

**Причины:**
1. Медленный интернет (скачивание base image)
2. Долгая сборка фронтенда
3. Антивирус сканирует файлы

**Решение:**
```powershell
# Проверить кеш образов
docker images

# Очистить неиспользуемые образы (освободить место)
docker system prune -af

# Исключить project из антивируса (Windows Defender)
Add-MpPreference -ExclusionPath "D:\Projects\eopp"
```

---

## Transfer проблемы

### SCP transfer зависает

**Причины:**
1. Медленное соединение
2. Файл образа большой (~500MB)
3. Firewall блокирует SCP

**Решение:**
```powershell
# Проверить скорость
scp -v -P 22 test.txt root@45.12.75.110:/tmp/

# Увеличить таймаут SSH (в .env.deploy)
# SSH_OPTIONS=-o ServerAliveInterval=30 -o ServerAliveCountMax=10

# Или вручную передать образ
docker save eopp:latest | gzip > eopp.tar.gz
scp -C eopp.tar.gz root@45.12.75.110:/tmp/
ssh root@45.12.75.110 "docker load -i /tmp/eopp.tar.gz"
```

### "No space left on device" на сервере

**Причина:** Диск заполнен старыми образами

**Решение:**
```bash
# На сервере проверить место
df -h

# Посмотреть образы
docker images

# Удалить старые образы
docker image prune -af

# Удалить все неиспользуемые ресурсы
docker system prune -af --volumes
```

---

## Health Check проблемы

### "Health check failed after 30 attempts"

**Шаг 1: Проверить логи**
```powershell
make deploy-logs
```

**Шаг 2: Проверить статус контейнера**
```bash
ssh root@45.12.75.110 "cd /opt/eopp && docker compose ps"
```

**Шаг 3: Проверить HTTP**
```bash
ssh root@45.12.75.110 "curl -sk https://localhost:8765/ -o /dev/null -w '%{http_code}'"
```

### Контейнер в статусе "Exited"

**Причины:**
1. Ошибка при запуске приложения
2. Порт 8765 уже занят
3. Не хватает памяти

**Решение:**
```bash
# Посмотреть логи
ssh root@45.12.75.110 "cd /opt/eopp && docker compose logs --tail=100"

# Проверить порт
ssh root@45.12.75.110 "netstat -tlnp | grep 8765"

# Проверить память
ssh root@45.12.75.110 "free -h"

# Перезапустить
ssh root@45.12.75.110 "cd /opt/eopp && docker compose restart"
```

### Контейнер running, но HTTP не отвечает

**Причины:**
1. Приложение не запустилось (ошибка в коде)
2. SSL сертификаты не сгенерированы
3. БД повреждена

**Решение:**
```bash
# Проверить SSL
ssh root@45.12.75.110 "ls -la /opt/eopp/certs/"

# Если нет сертификатов — перезапустить (сгенерируются автоматически)
ssh root@45.12.75.110 "cd /opt/eopp && docker compose restart"

# Проверить БД
ssh root@45.12.75.110 "ls -la /opt/eopp/data/"

# Если БД повреждена — восстановить из бэкапа
scp -r backups/LATEST_BACKUP/data root@45.12.75.110:/opt/eopp/
ssh root@45.12.75.110 "cd /opt/eopp && docker compose restart"
```

---

## Rollback проблемы

### "No previous image found for rollback"

**Причина:** На сервере только один образ (latest)

**Решение:**
```bash
# Посмотреть образы
ssh root@45.12.75.110 "docker images"

# Если только один — rollback невозможен
# Нужно либо:
# 1. Вручную загрузить предыдущую версию
# 2. Использовать бэкап данных и новый деплой

# Остановить контейнер
ssh root@45.12.75.110 "cd /opt/eopp && docker compose down"

# Восстановить данные из бэкапа
scp -r backups/LATEST_BACKUP/data root@45.12.75.110:/opt/eopp/

# Запустить заново
ssh root@45.12.75.110 "cd /opt/eopp && docker compose up -d"
```

---

## Nginx проблемы

### 502 Bad Gateway

**Причина:** Nginx не может подключиться к backend

**Решение:**
```bash
# Проверить backend
ssh root@45.12.75.110 "curl -sk https://localhost:8765/ -o /dev/null -w '%{http_code}'"

# Если backend не работает — проверить контейнер
ssh root@45.12.75.110 "cd /opt/eopp && docker compose ps"

# Проверить nginx конфиг
ssh root@45.12.75.110 "nginx -t"

# Перезапустить nginx
ssh root@45.12.75.110 "systemctl reload nginx"
```

### 401 Unauthorized (без запроса пароля)

**Причина:** Проблема с `.htpasswd`

**Решение:**
```bash
# Проверить файл
ssh root@45.12.75.110 "cat /etc/nginx/.htpasswd"

# Пересоздать
ssh root@45.12.75.110 "htpasswd -c /etc/nginx/.htpasswd admin"
ssh root@45.12.75.110 "systemctl reload nginx"
```

### SSL certificate error

**Причина:** Self-signed сертификат или истёкший Let's Encrypt

**Решение:**
```bash
# Проверить сертификат
ssh root@45.12.75.110 "openssl x509 -in /opt/eopp/certs/cert.pem -text -noout | grep -A2 'Validity'"

# Если Let's Encrypt — обновить
ssh root@45.12.75.110 "certbot renew"
ssh root@45.12.75.110 "cp /etc/letsencrypt/live/eopp.example.com/fullchain.pem /opt/eopp/certs/cert.pem"
ssh root@45.12.75.110 "cp /etc/letsencrypt/live/eopp.example.com/privkey.pem /opt/eopp/certs/key.pem"
ssh root@45.12.75.110 "cd /opt/eopp && docker compose restart"
```

---

## sqlite-web проблемы

### "Browser не сохраняет пароль"

**Причина:** Браузеры не сохраняют пароли для IP-адресов

**Решение:**
1. Привязать домен к IP в `/etc/hosts` или DNS
2. Использовать менеджер паролей (KeePass, Bitwarden)
3. Изменить пароль на более запоминающийся

### sqlite-web не доступен

**Причина:** Сервис не запущен или порт закрыт

**Решение:**
```bash
# Проверить сервис
ssh root@45.12.75.110 "docker ps | grep sqlite"

# Проверить порт
ssh root@45.12.75.110 "netstat -tlnp | grep 8080"

# Запустить через docker-compose.prod.yml
ssh root@45.12.75.110 "cd /opt/eopp && docker compose -f docker-compose.prod.yml up -d sqlite-web"
```

---

## Быстрая диагностика

```powershell
# Полный чеклист
Write-Host "=== Deploy Health Check ===" -ForegroundColor Cyan

# 1. Локальный Docker
docker info *>$null; if ($LASTEXITCODE -eq 0) { Write-Host "[OK] Docker" -ForegroundColor Green } else { Write-Host "[FAIL] Docker" -ForegroundColor Red }

# 2. SSH
ssh -o ConnectTimeout=5 root@45.12.75.110 "echo OK" 2>$null; if ($LASTEXITCODE -eq 0) { Write-Host "[OK] SSH" -ForegroundColor Green } else { Write-Host "[FAIL] SSH" -ForegroundColor Red }

# 3. Remote Docker
ssh root@45.12.75.110 "docker info" 2>$null; if ($LASTEXITCODE -eq 0) { Write-Host "[OK] Remote Docker" -ForegroundColor Green } else { Write-Host "[FAIL] Remote Docker" -ForegroundColor Red }

# 4. Container status
ssh root@45.12.75.110 "cd /opt/eopp && docker compose ps --format '{{.State}}'" 2>$null

# 5. HTTP check
ssh root@45.12.75.110 "curl -sk https://localhost:8765/ -o /dev/null -w 'HTTP: %{http_code}'" 2>$null
```
