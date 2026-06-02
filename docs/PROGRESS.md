# PROGRESS

Журнал работы по проекту. Новые записи — сверху.

---

## Production-деплой backend на VPS под доменом (Docker Compose + Caddy TLS)

**Дата:** 2026-06-02 · **Статус:** ✅ артефакты готовы (YAML/Docker валидны,
prettier чисто). Сам деплой запускается на VPS владельца — в среде нет Docker.
Разблокирует APK Этапа A (телефон → `https://<домен>`).

- **[deploy/Dockerfile](../deploy/Dockerfile)** — образ backend: pnpm-monorepo,
  `--filter @vpn/backend...` (без mobile/admin), build `@vpn/types`+backend;
  devDeps в образе, чтобы management-скрипты (db:migrate/vpn:seed/ads:seed/
  admin:create) гонять через `docker compose run`.
- **[docker-compose.prod.yml](../docker-compose.prod.yml)** — `mysql:8.4` +
  `redis:7` (AOF, §14.3) + `backend` + `caddy` (авто-Let's Encrypt). **DB/Redis
  наружу НЕ публикуются**, открыт только Caddy (80/443); `DATABASE_URL`/`REDIS_URL`
  заданы на service-имена. Dev-`docker-compose.yml` (локальная инфра) не тронут.
- **[deploy/Caddyfile](../deploy/Caddyfile)** — reverse-proxy на `backend:3000` +
  авто-TLS для `$DOMAIN`; query-string в логах режется (SSV signature/user_id, §9).
- **[deploy/.env.production.example](../deploy/.env.production.example)** — шаблон
  (DOMAIN, MySQL, JWT_SECRET, ADMIN_*, ADMOB_SSV_*, опц. Sentry/FCM/Integrity);
  реальный `deploy/.env.production` в `.gitignore` (+ негейт для `*.example`).
- **[.dockerignore](../.dockerignore)** — контекст без node_modules/dist/android/.git/секретов.
- **[docs/DEPLOY.md](DEPLOY.md)** — рунбук: DNS A-запись → Docker → `up -d --build`
  → migrate/seed/admin → `curl /health` → прописать `EXPO_PUBLIC_API_BASE_URL` в
  eas.json → собрать APK. + AdMob SSV URL, обновления/бэкап, что не делать.

**Что нужно от владельца:** VPS (порты 80/443) + DNS `api.<домен>` → IP VPS +
заполнить `deploy/.env.production` (пароли БД, `JWT_SECRET`, админ, `ADMOB_SSV_KEY`).

**Проверки:** YAML/Docker валидны · `prettier` ✅ (compose+docs) · код не менялся
(backend по-прежнему **117 тестов** зелёные).

---

## Production build pipeline + нативный VPN-модуль (скелет) — путь к APK

**Дата:** 2026-06-02 · **Статус:** ✅ JS/конфиг верифицируемо (typecheck/build/
**117 тестов** зелёные). Нативная Kotlin-часть собирается на устройстве (в среде
нет Android SDK) — это корректный production-скелет, не финальная сборка.

**Пайплайн сборки (production-correct):**
- **`app.config.ts`** вместо `app.json` — динамический конфиг, читает env
  (`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`); секреты не
  коммитятся (§7/§13), безопасные dev-дефолты. `app.json` удалён.
- **`eas.json`** — профили `development` (dev-client APK) / `preview`
  (внутренний APK) / `production` (AAB + `autoIncrement` + submit).
- **Скрипты** `build:dev|preview|prod`, `submit:prod`, `prebuild:clean`.
- **`.env.example`** дополнен mobile-секцией; `src/config.ts` уже читает
  `extra.apiBaseUrl`.

**Нативный VPN-модуль** (`apps/mobile/modules/vpn/`, Expo local module — CLAUDE.md
§3 «кастомный Kotlin-модуль + sing-box»):
- TS-API (`VpnModule`, типы `VpnStartConfig/VpnStatus`, событие `onStatusChange`).
- Kotlin: `VpnModule.kt` (тонкий мост JS↔натив, consent через `OnActivityResult`)
  + `VpnTunnelService.kt` (`VpnService` как foreground service: TUN, foreground
  notification, корректный `stop()`/`onRevoke()`, **seam под sing-box libbox**).
- `AndroidManifest.xml` модуля добавляет сервис с `BIND_VPN_SERVICE` +
  `foregroundServiceType=specialUse` + permission'ы (мерджится при prebuild).
- `modules/` исключён из app-typecheck (импортирует `expo-modules-core`,
  линкуется только в нативной сборке) — app остаётся зелёным.
- App-side контракт `src/features/vpn/types.ts` (типы под будущий `useVpn`),
  сырой config в JS не импортируется (§7.2).

**Документация:** [docs/BUILD.md](BUILD.md) (prereqs, EAS/локально, чек-лист теста
Этапа A, production-релиз/подпись/Play Console) + [docs/VPN.md](VPN.md)
(архитектура модуля, инварианты, TODO: добавить `libbox.aar`, подключить
sing-box, доставка config'а, включение кнопки «Подключиться»).

**Два этапа до теста:** **A — control-plane APK** (готов к сборке сейчас: язык/
регистрация/тестовая реклама→+30/баланс/баннеры/low-end/плохая сеть; кнопка VPN
выключена) → **B — full VPN APK** (после натива + `libbox.aar`).

**Проверки:** `typecheck` ✅ (вкл. mobile, `modules/` исключён) · `build` ✅ 4/4 ·
`test` ✅ **117** · `lint`/`format` ✅.

---

## Stage 9 (часть 1) — Устойчивость к плохому интернету + low-end режим (mobile)

**Дата:** 2026-06-02 · **Статус:** ✅ верифицируемый JS-срез (mobile typecheck +
весь монорепо зелёный, **117 тестов**). Нативная часть Stage 9 (размер APK, старт,
гейтинг анимаций) — отдельным заходом на устройстве. Это «инструменты выживания»
под слабый/нестабильный интернет Туркменистана (CLAUDE.md §6, §10.9, §14).

- **Устойчивый QueryClient** ([query-client.ts](apps/mobile/src/lib/query-client.ts)):
  `networkMode: 'offlineFirst'` (последние данные показываются сразу, даже офлайн),
  ретраи только транзиентных ошибок с **capped exponential backoff**
  (`min(1000·2^n, 15s)`), **4xx не ретраятся** (не жгут батарею/трафик),
  `gcTime` сутки (баланс/серверы/конфиг переживают холодный старт без сети),
  `refetchOnReconnect`, без `refetchOnWindowFocus`. Никакого polling.
- **Таймаут запроса** ([api/client.ts](apps/mobile/src/api/client.ts)):
  `AbortController` (15с) — полузависший сокет на плохой сети не вешает UI;
  сетевые/таймаут-ошибки маппятся в типизированный `NetworkError` (его и ретраит
  QueryClient), HTTP-ошибки остаются `ApiClientError`.
- **Low-end режим** (CLAUDE.md §6 «всегда есть lowEndMode fallback»): флаг в
  Zustand-сторе + персист в AsyncStorage + гидратация на старте; хук
  `useLowEndMode()` = пользовательский тумблер **ИЛИ** серверный форс
  `featureFlags.lowEndMode` (можно включить сегменту без релиза). Эффект сейчас:
  баланс/баннеры рефетчатся реже (экономия трафика); тумблер на Home (`Switch`),
  строки в i18n ru/tr/tk.

**Follow-up (нативное/отдельно):** персист кеша TanStack Query в AsyncStorage
(офлайн-first холодный старт; требует доп. пакеты), гейтинг анимаций по
lowEndMode (анимаций пока нет — инфраструктура готова), замеры размера APK и
времени старта.

**Проверки:** `typecheck` ✅ (вкл. mobile) · `build` ✅ 4/4 · `test` ✅ **117** · `lint`/`format` ✅.

---

## Stage 8 — Adversarial review (55 агентов) + исправление находок

**Дата:** 2026-06-02 · **Статус:** ✅ **117 тестов** (+6), build 4/4. Multi-agent
review (6 осей → дедуп → по 3 скептика на находку → синтез) дал **12
подтверждённых находок**; money-инварианты исправлены, остальное — hardening.

**[C1, крит/money] velocity-кап не денил, только копил скор.** `assessRewardGrant`
блокировал лишь по `score > fraud_score_max`, а превышение `reward_velocity_max`
просто добавляло +15. → устройство получало ~9 наград (≈270 мин) за окно до
блока, а на cadence ровно = cap фармило **бесконечно**. **Фикс:** превышение
кап-счётчика = **жёсткий deny в реальном времени** по атомарному Redis-счётчику
(не по медленному накоплению скора); порог по скору остался вторым гейтом.

**[C2/M1/M2, крит-сред/money] санитайзер конфига можно было обойти.** Не было
верхней границы (`fraud_score_max='1e9'` → гейт навсегда выключен, и для reward,
и для emergency — общий ключ); `reward_velocity_window_sec=0` → Redis `EXPIRE 0`
удалял ключ (счётчик мёртв); пустая строка → `Number('')===0` → эвристика тихо
отключалась. **Фикс:** общий [`configInt`](apps/backend/src/lib/config-num.ts) —
строгий `^\d+$` (режет `1e9`/decimals/пустую строку → fallback) + clamp `[min,max]`;
окно флорится `Math.max(1, …)` и в лимитере. Применён в fraud/emergency/remote-config.

**[M4, сред] ретраи SSV-callback'а штрафовали честных юзеров.** Гейт инкрементил
velocity до проверки идемпотентности → ретраи/реплеи AdMob накручивали счётчик и
могли тихо throttle'нуть легита. **Фикс:** счётчик считается **один раз на
transaction_id** (`firstSeen`/SETNX), ретраи только `peek`-ают окно.

**[M3, сред/privacy] подпись SSV + user_id текли в логи.** Авто-request-log
Fastify сериализовал полный `req.url` с query (signature/user_id/custom_data).
**Фикс:** кастомный `req`-сериализатор режет query-string во всех логах (остаётся
метод+путь).

**[M5, сред] integrity скорился только при создании устройства.** Девайс,
который рутуют после первого запуска, не переоценивался. **Фикс:**
`assessRegistration` теперь на каждом register (no-op + 0 запросов для genuine),
с дедупом сигнала по окну (`fraud_integrity_dedup_sec`, 24ч).

**[L1, low] проглоченная ошибка скоринга при регистрации была невидимой.**
**Фикс:** `catch` логирует через инжектнутый logger (`app.log`).

**[C3, money — KNOWN LIMITATION]** Все анти-фрод сигналы привязаны к `device_id`,
который минтится заново на любой свежий клиентский `installId` → Sybil/реинсталл
сбрасывает скор/блок. **Полноценно чинится только аттестацией устройства (Play
Integrity)** — это уже заложенный follow-up (seam `IntegrityVerifier` готов,
нужен реальный verify + enforcement). Per-IP гейт сознательно НЕ вводим: в
условиях CGNAT Туркменистана он бил бы по реальным юзерам сильнее, чем по фроду.
Митигировано: C1 теперь жёстко ограничивает фарм **на устройство** (cap/окно),
так что выгода с одной личности ограничена.

**Тесты (+6):** hard-deny овер-кап буста (C1); ретрай одного txn не накручивает
(M4); `1e9`/clamp/пустая строка/`window=0` не отключают гейт (C2/M1/M2); ре-скоринг
genuine→rooted с дедупом (M5). Все прежние тесты зелёные.

**Проверки:** `typecheck` ✅ · `build` ✅ 4/4 · `test` ✅ **117** · `lint`/`format` ✅.

---

## Stage 8 — Anti-fraud: движок скоринга + fraud_events + интеграция в reward

**Дата:** 2026-06-02 · **Статус:** ✅ серверная часть + admin полностью
верифицируемо (build 4/4 + **111 тестов**). Денежно-критичная фича — fraud
**только ДЕНЬИТ**, никогда не начисляет (§7.3/§7.5). Реальная верификация Play
Integrity (декод вердикта Google) — отдельный заход (нужны креды, §13).

- **Схема `fraud_events`** (device/event_type/severity/source/metadata) —
  лог каждого сигнала с дельтой скора; НЕ хранит сырые integrity-токены и
  содержимое трафика (§9). Миграция `0003_chief_ulik.sql`. `devices.addFraudScore`
  — атомарный инкремент (`SET fraud_score = fraud_score + d`).
- **`FraudService`** — превращает эвристики/абьюз в `fraud_events` + кумулятивный
  `fraud_score`:
  - `assessRegistration` (1 раз на новое устройство): репортнутый
    integrity-статус → событие (`emulator`/`rooted`/`debug`/`unknown`) + скор;
    при `PLAY_INTEGRITY_ENABLED` — верификация токена, **fail-closed** (ошибка
    верификатора = невалидный вердикт, не пропуск).
  - `assessRewardGrant`: velocity-rate-limit (Redis-счётчик, окно из конфига) →
    флаг при превышении; возвращает `blocked` если `score > fraud_score_max`.
  - Все пороги/severity — из `remote_config` (только неотрицательные int, чтобы
    скомпрометированная строка не ушла в минус и не снизила скор фродстеру).
- **Абстракции (как `SsvVerifier`):** `RateLimiter` (Redis fixed-window +
  InMemory) и `IntegrityVerifier` (`NoopIntegrityVerifier` / `PlayIntegrityVerifier`
  stub — без кредов падает громко). Оба override-ятся в тестах.
- **Интеграция:**
  - register (`DeviceService`): скоринг нового устройства, best-effort (сбой
    fraud-модуля не ломает регистрацию); добавлен optional `integrityToken`.
  - reward (`AdsService.grantSsvReward`): **тихий блок** флагнутого устройства —
    callback отвечает `200 granted:false`, минуты НЕ начисляются, фроду не видно,
    что его поймали (скрытый cooldown, §9). Emergency уже денил по
    `fraud_score > fraud_score_max` — теперь скор реально наполняется.
- **Admin:** `GET /api/admin/fraud/events` + вкладка **Fraud** (лог сигналов с
  severity/source; пояснение про `fraud_score_max`). Блок устройства был раньше.
- **Тесты (+10):** скоринг эмулятора/genuine; токен игнорится при выключенном
  Play Integrity; fail-closed на ошибке верификатора; velocity флагает и в итоге
  блокирует; пред-флагнутое устройство блок с первой награды; конфиг-override
  порогов; **e2e — флагнутое устройство получает `granted:false` и баланс 0**;
  эмулятор при регистрации виден в admin fraud-логе.

**Приватность (§9):** в `fraud_events` — только тип сигнала/severity/source,
никаких сырых токенов и трафика; admin-view не отдаёт metadata.

**Известное ограничение:** при `PLAY_INTEGRITY_ENABLED=false` (по умолчанию)
integrity-скоринг идёт по клиентскому `deviceIntegrityStatus` (эвристика);
серверная верификация Play Integrity токена Google — следующий заход.

**Проверки:** `typecheck` ✅ · `build` ✅ 4/4 · `test` ✅ **111** · `lint`/`format` ✅.

---

## Stage 6 — Push-уведомления (FCM): токены + кампании с таргетингом

**Дата:** 2026-06-02 · **Статус:** ✅ серверная часть + admin полностью
верифицируемо (build 4/4 + **101 тест**). In-app баннеры были раньше; теперь
закрыта вторая половина Stage 6 — серверный control plane для push. Реальная
доставка FCM HTTP v1 — отдельный заход (нужен service account, §7/§13).

- **Схема `push_campaigns`** (title/body/language/segment/country/status/
  recipient_count/sent_count/sent_at). Токены — в существующей `push_tokens`.
  Миграция `0002_stale_shotgun.sql`.
- **Репозитории:** `push-token` (`upsert` идемпотентен по token UNIQUE —
  переустановка переносит токен на новое устройство; `listEnabled/findByDevice/
  disableToken`) + `push-campaign` (`create/findById/listAll/setStatus/
  recordResult`), Drizzle + InMemory.
- **`PushSender`** (абстракция транспорта, как `SsvVerifier`): `NoopPushSender`
  (dev/test — ничего не шлёт) и `FcmPushSender` (требует креды, без них падает
  громко, а не молча роняет кампанию). Флаг `FCM_ENABLED` в env.
- **`PushDispatcher`** (`InlinePushDispatcher`, fire-and-forget): отправка идёт
  **вне HTTP-хендлера** (CLAUDE.md §6) — хендлер ставит `sending` и возвращается;
  доставка крутится на следующем тике. Прод-свап на BullMQ-воркер — тонкая
  замена (логика `sendCampaign` уже изолирована). ASSUMPTION в коде.
- **`PushService`:** `registerToken` (требует существующее устройство) + admin
  `createCampaign/list/startCampaign` (draft→sending, гард от двойной отправки,
  аудит) + `sendCampaign` (резолв получателей по **языку / стране / сегменту
  баланса**, исключение заблокированных, дизейбл невалидных токенов, запись
  counts+status).
- **Роуты:** клиент `POST /api/notifications/push-token`; admin
  `GET/POST /api/admin/push/campaigns`, `POST .../:id/send`. DI + фабрика +
  override `pushSender`/`pushDispatcher` для тестов.
- **Admin SPA — вкладка Notifications:** секция Push campaigns (таблица со
  статусом/получателями + кнопка Send только у draft) над секцией баннеров.
- **Mobile:** `registerPushToken(deviceId, token)`.
- **Тесты (+12):** идемпотентный upsert + перенос токена + 404 неизвестного
  устройства; таргетинг по языку/стране/сегменту; исключение заблокированных;
  дизейбл невалидных токенов + counts/status; failed при падении транспорта;
  e2e — auth, create draft, send→sending+enqueue+audit, повторный send → 400.

**Приватность:** admin-view кампании — только агрегаты (recipient/sent counts),
никаких per-device данных; клиент вообще не видит внутренности кампаний.

**Известное ограничение:** при `FCM_ENABLED=false` (по умолчанию) кампании
трекаются, но ничего не доставляется; реальная отправка и BullMQ-воркер с
ретраями — следующий заход (нужен FCM service account).

**Проверки:** `typecheck` ✅ · `build` ✅ 4/4 · `test` ✅ **101** · `lint`/`format` ✅.

---

## Ad waterfall config (10 провайдеров, серверный порядок, admin-управление)

**Дата:** 2026-06-02 · **Статус:** ✅ полностью верифицируемо (build 4/4 + **89
тестов**). Бэкенд отдаёт порядок медиации, приоритеты меняются без релиза
(CLAUDE.md §3 — «MAX как менеджер, waterfall через remote config»).

- **Схема `ad_providers`** (provider_key UNIQUE / name / priority / ecpm_estimate
  / fill_rate / ad_unit_id / timeout_ms / enabled). Миграция `0001_wooden_shape.sql`.
- **Сид 10 провайдеров** (priority 1→10): AppLovin MAX, Google AdMob (test unit),
  Unity LevelPlay, ironSource, Yandex, Pangle, Liftoff/Vungle, Mintegral, InMobi,
  Chartboost/DT-Exchange. Ad unit ids — placeholder'ы (§7.1), реальные в env/admin.
  Скрипт `pnpm --filter @vpn/backend ads:seed` (идемпотентен по `provider_key`).
- **`AdProviderService`** — `getWaterfall()` (только `enabled`, по `priority`,
  клиентский view **без eCPM/fill**) + admin `list/update/toggle` с аудитом.
- **Роуты:** `GET /api/ads/waterfall-config` (клиент, публичный — как `/api/ads/config`);
  admin `GET /api/admin/ads/providers`, `PATCH .../:id` (priority/eCPM/fill/adUnit/
  timeout/enabled, `minProperties:1`), `POST .../:id/toggle`.
- **Admin SPA — вкладка Ads:** таблица waterfall с inline-редактированием
  (priority/eCPM/fill/ad unit/timeout) + enable/disable; пояснение, что eCPM/fill
  и выключенные провайдеры в апку не уходят.
- **Mobile:** `fetchWaterfallConfig()` (для нативного MAX-слоя позже).
- **Тесты (+9):** клиент отдаёт 10 в порядке priority; **не утекают eCPM/fill/
  enabled**; disabled исключается и порядок сдвигается; admin list с экономикой;
  update priority → меняет клиентский порядок (audited); toggle off → выпадает
  из waterfall (audited); пустой body → 400; неизвестный id → 404.

**Инвариант приватности:** клиент получает только key/name/adUnitId/timeoutMs/
priority — eCPM/fill_rate остаются на бэкенде (аналог §7.2 для рекламы).

**Проверки:** `typecheck` ✅ · `build` ✅ 4/4 · `test` ✅ **89** · `lint`/`format` ✅.

---

## Stage 6 — In-app banners (таргетинг язык/сегмент/даты, admin + client + mobile)

**Дата:** 2026-06-01 · **Статус:** ✅ полностью верифицируемо (vite build + **80
тестов**). Push через FCM — нативное, отдельным заходом; in-app баннеры готовы.

- **Схема `in_app_banners`** (title/body/image/deeplink/language/segment/
  starts_at/ends_at/priority/enabled). Репозиторий + фабрика.
- **`BannerService.activeForDevice`** — фильтр по `enabled` + окну дат +
  **языку устройства** (null = всем) + **сегменту по балансу** (all/zero_balance/
  has_balance), сортировка по priority. Admin CRUD (create/toggle/delete) с
  аудитом.
- **Роуты:** `GET /api/notifications/in-app` (клиент, `x-device-id`) +
  `GET/POST /api/admin/banners`, `.../:id/toggle`, `DELETE .../:id`.
- **Admin SPA — вкладка Notifications:** таблица баннеров + форма создания
  (язык/сегмент/приоритет).
- **Mobile:** `fetchBanners` + `useBanners`; на Home показывается баннер с
  наивысшим приоритетом (карточка title/body).
- **Тесты:** таргетинг (язык null/совпадение, окно дат, enabled, сегмент по
  балансу, порядок по priority), e2e admin-создание → клиент видит → toggle/delete
  прячет, **клиентский view не отдаёт targeting-поля** (segment/enabled).

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · `test` ✅ **80** · `lint`/`format` ✅.

---

## Stage 5 — Emergency access (15 мин при no-fill), денежная фича + review

**Дата:** 2026-06-01 · **Статус:** ✅ backend + admin, **75 тестов**; adversarial
review денежной логики пройден, все находки исправлены.

Выдача 15 бесплатных минут, когда вся реклама не зашла и баланс 0 — под лимитами
и анти-абьюзом (CLAUDE.md §7.7).

- **`EmergencyService`** — гейты по порядку: `disabled → blocked → fraud →
has_balance → insufficient_failures → cooldown → daily_limit → weekly_limit`,
  затем выдача `emergency_free_access +cfg.minutes` в ledger. Конфиг из
  `remote_config` (правится в admin Remote Config tab).
- **Таблица `emergency_access_logs`** (каждое решение grant/deny + reason +
  failed-nets). Репозиторий: `record/countGrantedSince/listRecent`.
- **Роуты:** `POST /api/ads/no-fill-report` (клиент), `GET /api/admin/emergency/logs`.
- **Admin SPA — вкладка Emergency:** лог решений (granted/denied/reason).

**Adversarial review (10 агентов, 6 находок) → исправлено:**

- **[крит] обход квоты (TOCTOU):** read-before-write count + ledger-append без
  лока; time-bucket ref дедупил только в одном окне → конкурентные запросы через
  границу bucket могли превысить лимит и получить лишние +15. **Фикс:** ref
  теперь индексируется **по слоту = счётчику грантов** в day-namespace
  (`emergency:<dev>:<day>:<grantsToday>`) — конкурентные запросы с одинаковым
  счётчиком коллизятся на UNIQUE-индексе, и лимит держит **БД**, а не гонка.
- **[сред] отрицательный/дробный `emergency_minutes`** мог СПИСАТЬ у юзера и
  расходился с парсером app-config → теперь только неотрицательные целые
  (как `intNonNeg`).
- **[сред] проигравший гонку** логировал ложный `cooldown`-deny со stale-балансом,
  хотя кредит уже начислен → теперь возвращает success (свежий баланс) + лог
  `duplicate` (не раздувает счётчик квоты).

**Тесты (75):** грант + каждая причина отказа + идемпотентность; **burst из 6
конкурентных → ровно +15** (квота не превышена); sequential до maxPerDay → потом
daily_limit; отрицательный конфиг → не списывает; e2e через no-fill-report +
видимость в админке.

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · `test` ✅ **75** · `lint`/`format` ✅.

---

## Stage 8 — Admin: Remote Config редактор (управляет /api/app/config)

**Дата:** 2026-06-01 · **Статус:** ✅ верифицируемо (vite build + **58** тестов).

- **`RemoteConfigRepository.upsert`** (Drizzle `ON DUPLICATE KEY UPDATE` +
  in-memory Map). `AdminService.listRemoteConfig`/`setRemoteConfig` (аудит).
- **Роуты (guarded):** `GET /api/admin/remote-config`,
  `PUT /api/admin/remote-config` (`{key,value,valueType?}`, JSON-schema).
- **Admin SPA — вкладка Remote Config:** редактируемая таблица (value+type+Save)
  - форма добавления ключа.
- **E2E-тест:** админ ставит `reward_minutes_per_ad=45` → `GET /api/app/config`
  сразу отдаёт `rewardMinutesPerAd: 45` (один и тот же репозиторий питает оба),
  - запись в аудит. Доказывает связку admin → клиентский конфиг.

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · `test` ✅ **58** · `lint`/`format` ✅.

---

## Stage 4 — Admin: управление VPN (providers + servers CRUD)

**Дата:** 2026-06-01 · **Статус:** ✅ полностью верифицируемо (vite build + 57
тестов). Оператор управляет серверами, которые видит клиент (Stage 3).

- **Репозитории:** `VpnProviderRepository` (new) + `VpnServerRepository` расширен
  (listAll/create/setEnabled/delete). Сид-провайдер в `seed.ts` + тест-фабрике.
- **`AdminVpnService`:** провайдеры (со `serverCount`) и серверы (**admin-view с
  host/status** — в отличие от публичного), create/toggle/delete; каждое действие
  пишется в `admin_audit_logs`.
- **Роуты (guarded):** `GET/POST /api/admin/vpn/providers`,
  `.../providers/:id/toggle`, `GET/POST /api/admin/vpn/servers`,
  `.../servers/:id/toggle`, `DELETE /api/admin/vpn/servers/:id`.
- **Admin SPA — вкладка VPN:** карточки провайдеров, таблица серверов
  (status-badge, ping/load, enable/disable, delete), форма «Add server».
- **Тесты:** auth-guard, сид (serverCount=3), create→toggle→delete, disable
  убирает сервер из публичного каталога, 404 на чужой provider, аудит.

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · `test` ✅ **57** · `lint`/`format` ✅.
disable/delete сразу влияет на `GET /api/vpn/servers` и авто-выбор (enabled+online).

---

## Stage 7 — Economy: overview + break-even калькулятор (backend + admin)

**Дата:** 2026-06-01 · **Статус:** ✅ полностью верифицируемо (vite build + 52
теста). Раздел «Экономика» — инструмент выживания проекта (CLAUDE §14.5).

- **`modules/economy/calculate.ts`** — чистая `calculateEconomy(inputs)` (SPEC
  §"Admin financial analytics"): ads/day+month, expected revenue (только filled
  impressions), expected traffic TB, traffic cost, profit/loss, **break-even
  eCPM**. Месячные величины; линейны по users (кроме break-even).
- **`AdminService.economyOverview()`** — агрегаты из ledger (reward/emergency/
  vpn-минуты, устройства, ad-сессии).
- **Роуты (guarded):** `GET /api/admin/economy/overview`,
  `POST /api/admin/economy/calculate` (JSON-schema на 7 входов).
- **Admin SPA:** вкладка **Economy** — overview-карточки + форма калькулятора +
  результат + таблица проекций на **1000/5000/10000** пользователей.
- **Тесты:** калькулятор (известные числа, break-even обнуляет profit, линейное
  масштабирование, fillRate=0) + overview/calculate через admin-auth.

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · `test` ✅ **52** · `lint`/`format` ✅.

**Осталось верифицируемого:** admin CRUD VPN providers/servers, Ads-дашборд,
Fraud, Notifications, Remote Config. Нативное (несобираемое здесь): Kotlin
`VpnService`+sing-box, mobile VPN-экраны.

---

## Stage 3 — VPN backend control plane (servers, sessions, дедлайн, usage)

**Дата:** 2026-06-01 · **Статус:** ✅ backend готов, **46 тестов** зелёные;
adversarial review денежной логики пройден, все находки исправлены. Нативный
`VpnService`/sing-box — следующий шаг (dev-build-only).

**Adversarial review (15 агентов, 9 подтверждённых находок) → исправлено:**

- **[крит] missed-debit в stop:** если Redis-ключ истёк по TTL, а DB-строка ещё
  `active`, stop возвращал 0 без списания → теперь добивает из durable-строки.
- **[крит] гонка двойного start:** не было уникальности → две активные сессии,
  двойной allotment, отрицательный баланс. Добавил UNIQUE `active_device_id`
  (NULL после финализации) + reuse-on-race; одна активная сессия на устройство.
- **[сред] двойная финализация** перетирала audit-строку → `settle` single-winner
  (учитывает `created` от ledger, `finalize ... WHERE status='active'`), clamp
  списания к балансу (баланс не уходит в минус).
- **[сред] reuse** форс-финализировал валидную сессию при исчезнувшем сервере →
  решение только по дедлайну (§7.6), сервер — fallback на recommended.
- **[сред] не проверялся `status='online'`** → биллинг на мёртвом сервере; теперь
  start требует online, `pickBest` — только online (null если нет).
- **[низк]** поправлен комментарий про `vpn_usage` referenceId.

Денежно-критичная часть: **серверный дедлайн** (§7.6), агрегация usage в **Redis**
вместо записи в ledger на каждый heartbeat (§14.1), идемпотентное списание при
стопе, публичный список серверов **без утечки конфига** (§7.2).

**Схема (+3 таблицы → 11):** `vpn_providers`, `vpn_servers` (host/config_blob —
sensitive, не отдаются), `vpn_sessions` (token, allotted/debited minutes, bytes,
deadline, disconnect_reason).

**`modules/vpn`:**

- `VpnService`: `listServers`/`recommend` (публичный `VpnServerView`, качество
  green/orange/red, авто-выбор по score, online-фильтр); `startSession`
  (device/!blocked/**balance>0** → `allotted=min(balance,720)` → **deadline =
  serverTime+allotted** → короткоживущий token → DB + Redis live; реюз активной,
  `reconcileStale` для брошенных); `heartbeat` (token-auth, обновление **только
  Redis** §14.1, авто-finalize при дедлайне); `stopSession` (идемпотентно
  списывает `vpn_usage -elapsed`, ref `vpn_usage:<id>`, clamp к allotted).
- `VpnSessionStore` — Redis (JSON+TTL/KEEPTTL) + in-memory (тесты);
  `lib/redis-client.ts` ленивый `getRedis()`.
- Сид: `pnpm --filter @vpn/backend vpn:seed`.

**Роуты:** `GET /api/vpn/servers` · `/recommended` · `POST /session/start`
(`x-device-id`) · `/session/heartbeat` · `/session/stop` (token-auth) ·
`GET /session/current`.

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · `test` ✅ **42** · `lint`/`format` ✅.

**Допущения:** списание батчем при стопе (одна запись/сессия, §14.1),
идемпотентность через unique `reference_id`; `deadline=min(balance,720мин)`;
брошенные сессии — лениво (`reconcileStale`), reaper-воркер = Stage 9;
config/host не покидают backend (кроме `config` для нативного модуля); шифрование
at rest — заглушка; нативный `VpnService`+sing-box не подключал.

---

## Stage 2 — mobile: rewarded ad → SSV → баланс (AdMob client)

**Дата:** 2026-06-01 · **Статус:** ✅ код + `tsc`/`lint`/`format` зелёные. Нативный
AdMob крутится только в dev build (`expo prebuild`), здесь не собирается —
верификация на уровне типов.

Замкнул петлю Stage 2 на клиенте: кнопка «смотреть рекламу» на Home теперь живая.

- **`react-native-google-mobile-ads` 16.3.3** (под Expo 56). Инициализация SDK в
  `App.tsx`; конфиг-плагин + **test** App ID в `app.json` (публичный, заменить
  перед релизом).
- **`features/ads/useWatchAd.ts`** — `startAdSession` → `RewardedAd` с
  `serverSideVerificationOptions.customData = sessionId` → show → опрос баланса.
  **Награда не начисляется на клиенте** (EARNED_REWARD — no-op); кредит только
  по серверному SSV (§7.3).
- Home: кнопка с состояниями loading/verifying/error (i18n ru/tr/tk).

**Adversarial review** (2 линзы × верификация, 10 агентов) → подтверждено и
исправлено 4 дефекта в `useWatchAd`:

- **Re-entrancy/double-tap** — гард на React-state читал устаревший closure →
  синхронный `useRef`-lock.
- **Промис мог не зарезолвиться** (зависший ad без CLOSED/ERROR) → UI залипал →
  **settle-once + timeout** (45с).
- **Фиксированный опрос 6с** мог пропустить отложенный SSV на слабой сети →
  **опрос до фактического роста баланса** (cap 30с).
- **Проглоченный `catch {}`** → теперь `logError` (TODO: Sentry RN на этапе 8) +
  видимая ошибка на экране.

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · backend `test` ✅ 34 ·
`lint`/`format` ✅.

**Осталось по «всё»:** Stage 3 — **VPN** (backend control plane: vpn_providers/
servers, recommended server, session start с серверным дедлайном, heartbeat с
агрегацией usage в Redis §14.1, health-check; затем нативный `VpnService` +
sing-box — тоже dev-build-only).

---

## Stage 4 — Admin panel (auth + dashboard + devices), backend + SPA

**Дата:** 2026-06-01 · **Статус:** ✅ готово и полностью верифицируемо (реальный
`vite build` + 34 backend-теста). Контроль-панель поверх готового backend.

**Backend admin (`modules/admin`, аутентификация + RBAC-задел):**

- Таблицы: `admins` (email UNIQUE, scrypt-хеш пароля, role), `admin_audit_logs`
  (каждое действие — §6/§9). Миграция перегенерирована (8 таблиц).
- `lib/password.ts` — scrypt hash/verify (node:crypto, без нативных зависимостей,
  constant-time сравнение).
- JWT через `@fastify/jwt` (секрет из env, TTL `ADMIN_TOKEN_TTL`).
- `AdminAuthService` (verifyCredentials — анти-enumeration по времени;
  createAdmin), `AdminService` (dashboard-агрегаты, список/деталь устройств,
  block/unblock с записью в audit, logs).
- Роуты: `POST /api/admin/login` (публичный) + guarded-группа
  (`onRequest jwtVerify`): `/me`, `/dashboard`, `/devices` (пагинация),
  `/devices/:id`, `/devices/:id/block|unblock`, `/logs`.
- CLI сидинга: `pnpm --filter @vpn/backend admin:create <email> <pass>`.
- Репозитории расширены: device `list/count/countBlocked/setBlocked`, ledger
  `sumByType/listByDevice`, adSession `count`. Тест-фабрика
  `test-support/in-memory.ts` (DRY для всех integration-тестов).

**Admin SPA (`apps/admin`, Vite + React 19 + Tailwind v4 + TanStack Query + Zustand):**

- Auth-store (Zustand + `persist` в localStorage), API-клиент (fetch + Bearer,
  авто-logout на 401), типобезопасные вызовы через `@vpn/types`.
- Экраны: **Login** (форма + ошибки), **Dashboard** (карточки метрик),
  **Devices** (таблица, статус, block/unblock с инвалидацией, пагинация).
  Шапка с email + logout, табы. Dark premium-стиль.

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 (admin `vite build`, 75 модулей) ·
`test` ✅ **34** (login 401/200, JWT-guard 401, dashboard, devices, block→balance
403→unblock→200, audit) · `lint`/`format` ✅.

**Допущения:**

- **Пароли — scrypt** (node:crypto), без bcrypt/argon-нативщины. JWT-секрет в env
  (дефолт — небезопасный dev, обязателен override).
- **Идентификация устройства в админке** — по `device_id`; полноценный RBAC
  (roles/permissions), charts и разделы Economy/Fraud/Notifications/RemoteConfig —
  следующие итерации Stage 4/7.
- **Первый админ** — через `admin:create` (регистрации в админке нет, §«No
  registration»). `ADMIN_EMAIL/ADMIN_PASSWORD` — в `.env.example`.

**Дальше (осталось по «всё»):** mobile-AdMob (нативный SDK, dev build) → Stage 3
VPN (`VpnService` + sing-box, нативно). Обе части — не собираются в этой среде,
сделаю код + `tsc`.

---

## Stage 2 — Rewarded ads: backend reward pipeline (SSV → +30 в ledger)

**Дата:** 2026-06-01 · **Статус:** ✅ backend готов и протестирован (29 тестов);
mobile-часть (нативный AdMob SDK) — следующий шаг (нужен dev build для проверки).

Денежное ядро Stage 2: награда начисляется **только бэкендом**, по server-side
verification, идемпотентно. Сумма — **серверная** (из remote_config), не из
клиента/сети.

**Поток:** клиент `POST /api/ads/session/start` (→ `sessionId`) → показывает
rewarded ad, прокидывая `sessionId` как SSV custom_data → AdMob дергает
`GET /api/rewards/admob/ssv` → бэкенд проверяет подпись → начисляет
`reward_ad +30` в ledger (идемпотентно по `transaction_id`) → клиент перечитывает
баланс.

**Схема (+2 таблицы, миграция перегенерирована, всего 6):**

- `ad_sessions` — попытка просмотра (id = SSV custom_data), статус
  pending→rewarded, индексы (device,created)/(status).
- `reward_transactions` — аудит + сырой callback (`raw_callback` json),
  `transaction_id` UNIQUE.
- `minute_ledger.append()` — идемпотентная вставка (ON `ER_DUP_ENTRY` →
  `created:false`); `reference_id = transaction_id` — единый gate (§7.4).

**Модули `modules/ads`:**

- `RewardService.grantAdReward` — сумма из `RemoteConfigService` (§8), запись в
  ledger + best-effort аудит; idempotent. `expires_at` = +`maxBalanceDays`.
- `AdsService` — `startSession` (проверка device exists/!blocked) и
  `grantSsvReward` (session→device→reward→markRewarded).
- `ssv-verifier.ts` — `AdMobSsvVerifier` (реальная ECDSA-SHA256 проверка по
  ключам Google `verifier-keys.json`, кэш) + `NoopSsvVerifier` (для локальных
  test ads при `ADMOB_SSV_VERIFY=false`). Внедряется через DI
  (`buildServer({ ssvVerifier })`).
- `lib/db-errors.ts` — общий `isDuplicateKeyError` (вынес из device-репо).

**Роуты:** `POST /api/ads/session/start` (`x-device-id`) ·
`GET /api/ads/config` (rewarded unit из env + reward minutes) ·
`GET /api/rewards/admob/ssv` (verify → grant; 403 при плохой подписи, 404 при
неизвестной сессии, 200 + `granted` при успехе/дубле).

**env:** `ADMOB_APP_ID`, `ADMOB_REWARDED_UNIT_ID` (дефолт — Google **test**
unit), `ADMOB_SSV_VERIFY` (default true).

**mobile:** добавлены клиентские вызовы `startAdSession` / `fetchAdsConfig`
(`@vpn/types`). Кнопка «смотреть рекламу» на Home пока disabled — включится с
интеграцией нативного `react-native-google-mobile-ads` (dev build).

**Проверки:** `typecheck` ✅ 6/6 · `build` ✅ 4/4 · `test` ✅ **29** (idempotency,
double-credit guard, bad-signature reject, unknown-session 404, config) ·
`lint`/`format` ✅.

**Допущения:**

- **Сумма награды — серверная** (remote_config), `reward_amount` из AdMob
  игнорируется (анти-fraud).
- **ledger — gate идемпотентности**; `reward_transactions` — аудит (best-effort).
- **`ADMOB_SSV_VERIFY=false`** — только для локальных test ads, логируется WARN.
- Нативный AdMob SDK не подключал (верификация только `tsc`); это следующий
  mobile-шаг с dev build.

**Дальше:** mobile — `react-native-google-mobile-ads` + `useRewardedAd` (load/
show/SSV custom_data) + разблокировка кнопки на Home; затем Stage 3 (VPN).

---

## Stage 1 — часть 3: mobile foundation (язык, onboarding, регистрация)

**Дата:** 2026-06-01 · **Статус:** ✅ готово, `typecheck`/`lint`/`format` зелёные
(сборка/запуск APK — только с Android SDK; здесь верифицируется `tsc --noEmit`).

Завершает Stage 1 на клиенте: первый запуск → выбор языка → onboarding →
анонимная регистрация устройства → главный экран с балансом.

**Стек (версии — точно под Expo 56 `bundledNativeModules`):** React Navigation 7
(native-stack), TanStack Query 5, Zustand 5, i18next + react-i18next (ru/tr/tk),
expo-secure-store / expo-localization / expo-crypto / expo-constants,
async-storage. Reanimated пока не тянул (анимации — на встроенном `Animated`),
чтобы не усложнять babel/worklets; добавим под богатые анимации позже.

**Структура `apps/mobile/src`:**

- `config.ts` — `API_BASE_URL` из `app.json → extra` (дефолт `10.0.2.2:3000` —
  хост для Android-эмулятора), `APP_VERSION`.
- `theme/` — dark-first палитра/spacing/radius (без theming-либы).
- `i18n/` — init + локали `ru` (источник типа `Translation`) / `tr` / `tk`;
  парность ключей гарантируется типом.
- `lib/storage.ts` — device_id/install_id в SecureStore, язык/onboarded в
  AsyncStorage. `lib/device-info.ts` — install_id (uuid, persisted), сбор
  `country/timezone/appVersion` для register.
- `api/` — `client.ts` (fetch + `x-device-id`, единый `ApiClientError`),
  `endpoints.ts` (register/heartbeat/app-config/balance, типы из `@vpn/types`).
- `store/app-store.ts` — Zustand (`hydrated/language/deviceId/onboarded`).
- `hooks/queries.ts` — `useRegisterDevice` (mutation), `useAppConfig`,
  `useBalance`. `hooks/useBootstrap.ts` — гидратация из storage + идемпотентная
  регистрация устройства, как только выбран язык.
- `navigation/RootNavigator.tsx` — flow по состоянию (auth-flow pattern):
  Splash (до гидратации) → Language → Onboarding → Home.
- `screens/` — Splash (fade-in), Language (ru/tr/tk), Onboarding (4 слайда +
  privacy), Home (баланс из API, кнопки connect/watch-ad как `disabled` —
  VPN=Stage 3, ads=Stage 2). `components/` — Button, ScreenContainer.
- `App.tsx` — провайдеры: QueryClient → SafeArea → NavigationContainer (dark
  theme) → RootNavigator; i18n init на импорте.

**Проверки:** `pnpm typecheck` ✅ 6/6 (вкл. mobile) · `pnpm lint` ✅ ·
`pnpm format:check` ✅ · backend `pnpm test` ✅ 20.

**Допущения:**

- **Без Reanimated** на этом этапе (см. выше) — fallback-анимации на `Animated`.
- **API base** для эмулятора — `10.0.2.2`; для реального устройства поменять в
  `app.json → extra.apiBaseUrl` (или позже через `EXPO_PUBLIC_*`).
- **Split tunneling / push-token endpoint / VPN-экраны** — отдельные экраны
  заложены интерфейсно, реализация по своим этапам.
- Иконки/сплэш-ассеты не добавлял (нужны на `expo prebuild`).

**Дальше:** Stage 2 — AdMob test ads → ad session → SSV reward → запись
`reward_ad +30` в ledger (идемпотентно по transaction_id) → разблокировка кнопок
на Home.

---

## Stage 1 — часть 2.1: исправления по adversarial-review

**Дата:** 2026-06-01 · **Статус:** ✅ применено, всё зелёное (20 тестов).

Прогнал многоагентный review новой логики (4 линзы × отдельная проверка каждой
находки). Подтверждено и исправлено 7 дефектов:

- **[крит] Error handler не наследовался роутами.** `setErrorHandler` вызывался
  ПОСЛЕ `await app.register(routes)` → роуты (encapsulated context) брали
  дефолтный обработчик Fastify, а не наш envelope. Перенёс установку обработчика
  ДО регистрации роутов. (Этот баг маскировал часть находок ниже.)
- **Гонка `register` по `install_id`** → дубль-ключ выдавал 500 вместо
  идемпотентного ответа. `create()` теперь ловит `ER_DUP_ENTRY` →
  `DuplicateInstallIdError`, сервис перечитывает строку победителя. In-memory
  репозиторий теперь тоже моделирует UNIQUE (тест гонки).
- **Идемпотентность ledger.** UNIQUE был `(entry_type, reference_id)` — один
  `transaction_id` мог начислить дважды под разными типами. Сделал глобальный
  ключ `UNIQUE(reference_id)` (§7.4); usage оставляет NULL. Миграция
  перегенерирована.
- **Validation → канонический код.** Schema-ошибки отдавали `FST_ERR_VALIDATION`
  вместо `VALIDATION_ERROR`. Хэндлер мапит validation/400 → `ValidationError`.
- **Утечка внутренних кодов на 5xx.** Хэндлер больше не эхо-ит `error.code`
  драйвера/фреймворка — только enum (`INTERNAL_ERROR` на 5xx).
- **`register` теперь enforce `is_blocked`** (как heartbeat/balance): блок
  кидает `DeviceBlockedError` до `touch()`.
- **`pushToken`** убран из контракта register (захват — через выделенный
  `/api/device/push-token` на этапе нотификаций), чтобы не терять данные молча.
- **`remote_config` числа** валидируются как неотрицательные целые (иначе откат
  к дефолту) — защита от тихого усечения при сериализации.

---

## Stage 1 — Foundation · часть 2: данные + регистрация устройства + конфиг

**Дата:** 2026-06-01 · **Статус:** ✅ готово, всё зелёное.

### Что сделано

Первый вертикальный срез данных. Слой данных вынесен за интерфейсы-репозитории,
поэтому тесты идут **без живой БД** (in-memory), а миграции генерируются
статически (drizzle-kit не нужен коннект для `generate`).

**packages/types** — расширены контракты: `ErrorCode` (единый enum §8),
`Platform`/`Language`, `LedgerEntryType`, DTO `DeviceRegisterRequest/Response`,
`HeartbeatRequest/Response`, `BalanceResponse`, `AppConfig`.

**backend — БД (Drizzle ORM + MySQL).** Схема (Stage 1 таблицы):

- `devices` — анонимный профиль (device_id = uuid, server-issued), `install_id`
  UNIQUE (идемпотентность), индексы country/language/last_seen/is_blocked,
  `fraud_score`, `is_blocked`, `balance_minutes_cache` (производный кеш).
- `minute_ledger` — **источник правды по балансу** (баланс = знаковая
  `SUM(minutes)`), append-only. UNIQUE `(entry_type, reference_id)` → reward/
  emergency callback не начислит дважды (§7.4); usage оставляет `reference_id`
  NULL (в MySQL NULL'ы не конфликтуют). Индекс `(device_id, created_at)`.
- `push_tokens`, `remote_config` (key/value + value_type).
- `db/client.ts` — ленивый mysql2 pool + Drizzle (коннект только на первый
  запрос; `/health` и тесты БД не трогают).
- Миграция сгенерирована: `apps/backend/drizzle/0000_*.sql` (4 таблицы, индексы).
- Скрипты: `db:generate` / `db:migrate` / `db:push` / `db:studio`.

**backend — модули (репозиторий → сервис → роут, DI):**

- `device`: репозиторий (Drizzle + in-memory), `DeviceService.register`
  (идемпотентность по deviceId → install_id → новый uuid), `heartbeat`,
  `getBalance` (через ledger, не доверяя клиенту), проверка `is_blocked`.
- `ledger`: `LedgerRepository.getBalance` (`COALESCE(SUM(minutes),0)`).
- `remote-config`: `RemoteConfigService.getAppConfig` накладывает overrides из
  `remote_config` на типизированные дефолты (30 мин/реклама, 15 emergency,
  maxBalanceDays 365, maintenance/forceUpdate/minAppVersion/splitTunneling/flags).
- `lib/errors.ts` — `AppError` + `NotFound/Validation/DeviceBlocked`; error
  handler в `server.ts` мапит их в единый envelope `{ error: { code, message } }`.

**Роуты** (JSON-schema валидация вход/выход, §6):

- `POST /api/device/register` · `POST /api/device/heartbeat` (хедер
  `x-device-id`) · `GET /api/rewards/balance` (хедер `x-device-id`) ·
  `GET /api/app/config`.
- `buildServer({ repositories? })` — DI: прод = Drizzle, тесты = in-memory.

### Проверки

| Команда             | Результат                                                                           |
| ------------------- | ----------------------------------------------------------------------------------- |
| `pnpm typecheck`    | ✅ 6/6                                                                              |
| `pnpm build`        | ✅ 4/4                                                                              |
| `pnpm test`         | ✅ **17 тестов** / 4 файла (идемпотентность, баланс=ledger, конфиг, роуты, 400/404) |
| `pnpm lint`         | ✅ 0 проблем                                                                        |
| `pnpm format:check` | ✅                                                                                  |
| `db:generate`       | ✅ `drizzle/0000_*.sql`                                                             |

### Допущения

- **Слой репозиториев** (интерфейс + Drizzle + in-memory) — ради тестируемости
  без БД и будущей замены провайдеров; не over-engineering (деньги/идемпотентность).
- **Идентификация устройства** на защищённых ручках — через хедер `x-device-id`
  (полноценный device-токен/JWT и Play Integrity — Stage 8).
- **Схему ведём по этапам** (а не одну гигантскую миграцию наперёд): Stage 1 =
  4 таблицы; остальные таблицы SPEC добавятся со своими этапами.
- **Запись в ledger ещё не делаем** — только чтение баланса; начисления
  (`reward_ad +30`, агрегированный `vpn_usage`) приходят в Stage 2/3 (§14.1).
- `drizzle/` исключён из Prettier (генерится drizzle-kit, как lockfile).

### Дальше

- Mobile UI: splash → выбор языка (i18next ru/tr/tk) → onboarding → клиент
  `/api/device/register` (TanStack Query) + кеш баланса (Zustand).
- Stage 2: AdMob test ads → ad session → SSV reward → запись `reward_ad +30` в
  ledger (идемпотентно по transaction_id) → экран баланса.

---

## Stage 1 — Foundation · часть 1: каркас монорепо

**Дата:** 2026-06-01 · **Статус:** ✅ готово, всё зелёное.

### Что сделано

Поднят скелет монорепо (pnpm workspaces + Turborepo). Бизнес-логики нет —
только инфраструктура, чтобы следующие этапы вставали без переписывания.

**Корень**

- `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (tasks: build /
  typecheck / test / lint / dev / clean).
- `.npmrc` — `node-linker=hoisted` (нужно для Metro/Expo в монорепо).
- Общий тулчейн: TypeScript 6.0, ESLint 10 (flat config) + typescript-eslint 8,
  Prettier 3, Turbo 2.9.
- `.env.example` — все секреты как заглушки (CLAUDE.md §7/§13): DATABASE_URL,
  REDIS_URL, SENTRY_DSN, JWT_SECRET, FCM, ad unit ids, Play Integrity,
  VPN-плейсхолдеры (`HAPP_CRYPT4_PLACEHOLDER`, `VLESS_PLACEHOLDER`, …).
- `docker-compose.yml` — MySQL 8.4 + Redis 7 **с AOF** (`--appendonly yes`,
  CLAUDE.md §14.3).
- `.gitignore`, `.prettierignore`, `README.md`.

**packages/**

- `@vpn/config` — общие пресеты: `tsconfig.base.json` (strict, NodeNext,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`), `eslint.base.mjs`,
  `prettier.base.mjs`. Используется backend/admin/packages.
- `@vpn/types` — единый источник API-контрактов. Пока: `API_VERSION`,
  `ApiError` (единый формат ошибок §8), `HealthResponse`. Импортируется всеми
  тремя приложениями (доказывает сквозную типизацию).
- `@vpn/shared` — генерик-хелперы (`sleep`, `isDefined`, `assertNever`).

**apps/backend** (Fastify 5 + TS, ESM)

- `GET /health` → `{ status, service, version, apiVersion, uptimeSeconds, timestamp }`.
- Конфиг через env с валидацией Zod (`src/config/env.ts`), fail-fast.
- Sentry — wiring без логики (`src/instrument.ts`, no-op без DSN).
- Redis — плагин `ioredis` (`lazyConnect`, не дёргает сеть на старте; AOF — на
  стороне сервера).
- helmet + cors + sensible, единый error handler (формат `{ error }`).
- Vitest: тест `/health` (зелёный). Реальная загрузка `node dist/index.js` →
  `200` проверена вручную.

**apps/admin** (Vite 8 + React 19 + TS + Tailwind v4)

- Пустая премиум-заглушка (`App.tsx`), Tailwind через `@tailwindcss/vite`
  (CSS-first, `@import "tailwindcss"`). `vite build` зелёный.

**apps/mobile** (Expo SDK 56, prebuild-совместимый, RN 0.85 + TS)

- Один пустой экран (`App.tsx`), `index.ts` → `registerRootComponent`.
- `metro.config.js` настроен под монорепо (watchFolders + nodeModulesPaths).
- `tsconfig` расширяет `expo/tsconfig.base`. `app.json` — Android-only,
  `newArchEnabled`. Нет `build`-скрипта (реальная сборка — через EAS/prebuild с
  Android SDK); покрыт `typecheck`.

### Проверки (всё чисто)

| Команда                                   | Результат                                                       |
| ----------------------------------------- | --------------------------------------------------------------- |
| `pnpm install`                            | ✅ ok (build-скрипты esbuild/msgpackr одобрены в `allowBuilds`) |
| `pnpm build`                              | ✅ 4/4 (types, shared, admin, backend; mobile пропущен)         |
| `pnpm typecheck`                          | ✅ 6/6 (вкл. mobile и backend-тесты)                            |
| `pnpm test`                               | ✅ 1 тест (`/health`)                                           |
| `pnpm lint`                               | ✅ 0 проблем                                                    |
| `pnpm format:check`                       | ✅                                                              |
| boot `node dist/index.js` + `GET /health` | ✅ HTTP 200                                                     |

### Принятые допущения (ASSUMPTION)

- **TS 6.0.3 + последние мажоры** (ESLint 10, Vite 8, Tailwind 4, Expo 56).
  Проверена совместимость: typescript-eslint 8.60 поддерживает eslint 10 и
  `typescript <6.1`, а Expo 56 сам пинит TS `~6.0.3` — конфликта нет.
- **backend — ESM + NodeNext**, относительные импорты с `.js` (требование
  NodeNext). Сборка `tsc`, dev — `tsx watch`.
- **Внутренние пакеты компилируются в `dist`** (а не source-only), чтобы
  собранный backend запускался `node dist/index.js` без бандлера.
- **`node-linker=hoisted`** — стандарт для RN/Expo в pnpm-монорепо.
- **mobile без CI-`build`** — нельзя собрать APK без Android SDK; валидация —
  через `typecheck`. `app.json` без кастомных иконок/сплэша (добавятся на
  prebuild-этапе).
- **AOF Redis** вынесен в `docker-compose.yml` (это server-side настройка, не
  клиента).

### Дальше (Stage 1 — часть 2 и далее)

- MySQL schema + Drizzle (`drizzle-kit`), миграции, таблицы из SPEC.md.
- `POST /api/device/register` + anonymous device profile.
- `remote_config` (таблица + `GET /api/app/config`).
- Базовый UI mobile: splash, выбор языка (i18next ru/tr/tk), onboarding.
- Зашить интерфейсы под ledger / split tunneling заранее (не реализацию).
