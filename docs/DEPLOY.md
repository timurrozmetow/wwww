# DEPLOY.md — backend на VPS под доменом (HTTPS)

> Поднимает control-plane backend (Fastify + MySQL + Redis-AOF) за Caddy с
> авто-TLS. После этого телефон ходит на `https://<домен>` и можно собирать APK
> Этапа A. Файлы: [`docker-compose.prod.yml`](../docker-compose.prod.yml),
> [`deploy/`](../deploy/).

## 0. Что нужно от тебя (то самое «говори что надо»)

1. **VPS** (Linux, 1–2 vCPU / 2 ГБ RAM хватает на 10k) с публичным IP, открыты порты **80 и 443**.
2. **Домен/субдомен под API**, например `api.твойдомен` → **DNS A-запись на IP VPS**.
3. **Пароли/секреты**, которые впишешь в `deploy/.env.production` (см. шаг 3):
   - пароль MySQL (root + пользователь), сильный `JWT_SECRET`, логин/пароль админки;
   - `ADMOB_SSV_KEY` (публичный ключ AdMob SSV) — для проверки коллбэков; реальные ad unit ids/MAX — позже, для теста хватает тестовых.
4. (опц.) `SENTRY_DSN`, FCM service account — можно позже.

Трафик самого VPN идёт **мимо** этого сервера (через серверы VLESS/sing-box) — здесь только control plane: баланс, сессии, реклама, конфиги, анти-фрод.

## 1. DNS

Создай A-запись: `api.твойдомен` → `<IP VPS>`. Дождись пропагации (`dig api.твойдомен +short` должен вернуть IP VPS).

## 2. VPS: Docker

```bash
curl -fsSL https://get.docker.com | sh          # Docker + compose plugin
sudo usermod -aG docker $USER && newgrp docker   # без sudo
```

Открой 80/443 в фаерволе (ufw/security group).

## 3. Код + секреты

```bash
git clone <repo-url> vpn-app && cd vpn-app
cp deploy/.env.production.example deploy/.env.production
# заполни DOMAIN, MYSQL_*, JWT_SECRET, ADMIN_*, ADMOB_SSV_KEY:
#   openssl rand -hex 32   # для JWT_SECRET
nano deploy/.env.production
```

`deploy/.env.production` в `.gitignore` — реальные значения не коммитятся.

## 4. Запуск

```bash
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d --build
```

Caddy сам получит TLS-сертификат для `$DOMAIN` (нужны рабочие DNS + 80/443).

## 5. Миграции + сиды + админ (один раз)

```bash
C="docker compose --env-file deploy/.env.production -f docker-compose.prod.yml run --rm backend pnpm"
$C db:migrate     # создаёт таблицы (drizzle)
$C vpn:seed       # placeholder VPN-провайдер + серверы
$C ads:seed       # 10 ad-провайдеров (waterfall)
$C admin:create   # админ из ADMIN_EMAIL/ADMIN_PASSWORD
```

## 6. Проверка

```bash
curl https://<домен>/health           # {"status":"ok",...}
docker compose -f docker-compose.prod.yml logs -f backend caddy
```

- `/health` отвечает по HTTPS, сертификат валиден;
- логин в админку: `POST https://<домен>/api/admin/login` (или открыть админ-SPA, шаг 9).

## 7. Подключить мобилку (Этап A)

В [`apps/mobile/eas.json`](../apps/mobile/eas.json) профиль `preview`:

```json
"EXPO_PUBLIC_API_BASE_URL": "https://<домен>"
```

Затем `pnpm --filter @vpn/mobile build:preview` → поставить APK на телефон (см. [BUILD.md](BUILD.md)).

## 8. AdMob SSV

Reward начисляется только по верифицированному SSV-коллбэку. Коллбэк должен
доставать `https://<домен>/api/rewards/admob/ssv` (Caddy уже проксирует). Держи
`ADMOB_SSV_VERIFY=true` и заполни `ADMOB_SSV_KEY`.

## 9. Админ-SPA (опционально)

Дашборд — отдельное Vite-приложение. Проще всего запускать локально, указывая на прод:

```bash
VITE_API_BASE_URL=https://<домен> pnpm --filter @vpn/admin dev
```

Либо собрать (`pnpm --filter @vpn/admin build`) и раздать статику отдельным сервисом/Caddy-блоком.

## 10. Эксплуатация

- **Обновление:** `git pull && docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d --build` (миграции при необходимости — шаг 5).
- **Бэкап:** том `mysql_data` (например `docker compose ... exec mysql mysqldump ...`) + `redis_data` (AOF).
- **Масштаб надёжности (не throughput):** backend stateless — можно поднять 2+ реплики за Caddy; одного инстанса на 10k по производительности хватает (CLAUDE.md §14.6). Без Kubernetes/шардинга — это over-engineering на этом масштабе.

## Не делать

- Не коммить `deploy/.env.production`, keystore, реальные ключи.
- Не публиковать порты MySQL/Redis наружу (в prod-compose их нет — и не добавляй).
- Не ставить `ADMOB_SSV_VERIFY=false` в проде.
