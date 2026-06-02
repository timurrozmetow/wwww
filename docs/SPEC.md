Ты senior mobile architect, senior React Native developer, Android VPN engineer, backend engineer, security engineer, ads monetization expert и product designer.

Мне нужно спроектировать и разработать production-ready Android VPN-приложение с монетизацией через rewarded ads.

Проект:
Бесплатное VPN-приложение для Android. Пользователь без регистрации смотрит рекламу и получает VPN-доступ. За 1 полностью просмотренную rewarded-рекламу пользователь получает 30 минут VPN. Пользователь может копить минуты до 1 года. Когда время заканчивается, VPN автоматически отключается.

Основной рынок: Туркменистан.
Интернет у пользователей часто слабый и нестабильный.
На старте приложение будет распространяться как APK для тестирования.
Позже возможна публикация в Google Play и других магазинах.
Цель на первый этап: 10 000 установок.
Нужно сделать приложение лёгким, быстрым, красивым, анимированным, но чтобы оно хорошо работало даже на слабых Android-телефонах.

Мои знания:
- React Native
- Expo CLI
- Node.js
- MySQL
- React + Vite

Важно:
Обычный Expo Go не использовать для production, потому что VPN требует нативную Android-часть.
Можно использовать Bare React Native или Expo Prebuild / Expo Development Build.
Нужно объяснить, какой вариант лучше для этого проекта.

Платформа:
- MVP: только Android.
- iOS пока не нужен.
- Android-приложение должно работать через APK.
- Клиент: React Native + TypeScript.
- VPN native layer: Kotlin + Android VpnService.
- VPN core: выбрать самый стабильный и оптимизированный вариант для плохого интернета. Предпочтительно рассмотреть sing-box core. Если есть вариант лучше — объяснить почему.
- Backend: Node.js + TypeScript + Fastify или Express.
- Database: MySQL.
- Cache / rate limit / sessions: Redis.
- Queue/background jobs: BullMQ или аналог.
- Admin panel: React + Vite + TypeScript + TailwindCSS.
- Push notifications: FCM.
- UI languages: русский, турецкий, туркменский.

Главная идея приложения:
Пользователь скачал приложение.
Регистрации нет.
Телефон/email не нужны.
Пользователь открывает приложение, разрешает VPN permission, нажимает “Смотреть рекламу”, досматривает рекламу полностью, получает 30 минут, выбирает сервер или нажимает “Авто”, подключается к VPN. Когда минуты заканчиваются, VPN отключается.

Но:
Баланс нельзя хранить только на телефоне, потому что его можно взломать.
Нужно сделать без регистрации, но с anonymous device profile.
То есть пользователь не регистрируется, но backend создаёт device_id и хранит баланс на сервере.
На телефоне можно хранить кеш баланса для быстрого отображения, но backend должен быть главным источником правды.

Anonymous device profile:
При первом запуске приложение создаёт:
- device_id
- install_id
- app_version
- platform
- language
- country
- timezone
- push_token, если пользователь разрешил уведомления
- device_integrity_status, если доступно
- created_at
- last_seen_at

Пользовательский сценарий:
1. Пользователь устанавливает APK.
2. Открывает приложение.
3. Видит красивый onboarding:
   - что это бесплатный VPN
   - как работает доступ за рекламу
   - 1 реклама = 30 минут
   - время можно копить до 1 года
   - VPN отключается после окончания времени
   - политика приватности
4. Приложение создаёт anonymous device profile.
5. Пользователь выбирает язык: русский / турецкий / туркменский.
6. Приложение просит VPN permission.
7. Приложение отдельно просит push notification permission.
8. Пользователь попадает на главный экран.
9. На главном экране:
   - большая кнопка подключения
   - выбранный сервер
   - оставшееся VPN-время
   - кнопка “Смотреть рекламу +30 минут”
   - кнопка “Выбрать сервер”
   - статус качества сервера
   - in-app banner, управляемый из админки
10. Если баланс 0, кнопка подключения заблокирована и предлагается посмотреть рекламу.
11. Пользователь нажимает “Смотреть рекламу”.
12. Приложение показывает rewarded ad.
13. Если пользователь закрыл рекламу или пропустил её — награда не начисляется.
14. Если пользователь досмотрел рекламу полностью — backend подтверждает reward и начисляет +30 минут.
15. Пользователь выбирает сервер или “Авто”.
16. Приложение запускает VPN.
17. При подключении обязательно показать красивую анимацию:
    - connecting
    - securing tunnel
    - connected
18. Во время работы VPN показывать:
    - страна
    - флаг
    - название сервера
    - ping/ms
    - качество: зелёный / оранжевый / красный
    - оставшееся время
    - трафик upload/download
    - длительность текущей сессии
19. Когда остаётся 5 минут — показать локальное/push/in-app уведомление.
20. Когда остаётся 1 минута — показать предупреждение.
21. Когда время закончилось — VPN должен автоматически отключиться.
22. После отключения предложить посмотреть рекламу и продлить доступ.

Reward system:
- 1 rewarded ad = 30 минут.
- Пользователь может копить минуты до 1 года.
- Нет платного тарифа на старте.
- Нет visible daily limit.
- Пользователь может смотреть рекламу сколько хочет.
- Но должны быть скрытые anti-fraud лимиты для защиты от накрутки.
- Баланс хранится на backend по device_id.
- На телефоне хранится только кеш.
- Все начисления/списания должны идти через ledger.

Minute ledger:
Нужно использовать ledger-подход:
- reward_ad +30
- emergency_free_access +15
- vpn_usage -N
- admin_adjustment +/-
- fraud_reversal -
- expired_minutes -

Текущий баланс можно кешировать, но все операции должны записываться в ledger.

Реклама:
Нужно сделать 10 рекламных источников.
Логика:
Сначала пробовать рекламную сеть, которая платит больше.
Если рекламы нет — пробовать следующую.
Если у второй нет — третью.
Так до 10 сетей.
Если у всех 10 нет рекламы, а у пользователя 0 минут, backend выдаёт 15 минут бесплатного emergency access.
Это обязательно должно быть видно в админке.

Рекламные сети:
1. AppLovin MAX / AppLovin Exchange
2. Google AdMob
3. Unity Ads / Unity LevelPlay
4. ironSource / LevelPlay demand
5. Yandex Mobile Ads
6. Pangle
7. Liftoff / Vungle
8. Mintegral
9. InMobi
10. Chartboost или DT Exchange / Fyber

Дополнительный резерв:
- Start.io

Важно:
Не интегрировать 10 SDK хаотично.
Нужно использовать mediation/waterfall.
Основной вариант: AppLovin MAX или Unity LevelPlay как mediation manager.
Нужно объяснить, какой mediation manager лучше для старта в Туркменистане и APK-тестировании.

Ad waterfall logic:
1. Client запрашивает у backend /api/ads/waterfall-config.
2. Backend отдаёт список активных ad providers:
   - provider_id
   - provider_name
   - priority
   - eCPM estimate
   - fill rate
   - ad_unit_id
   - timeout_ms
   - enabled
   - country rules
   - min app version
3. Client заранее preload rewarded ad.
4. Пользователь нажимает “Смотреть рекламу”.
5. Client пробует Provider #1.
6. Если ad loaded — показать.
7. Если completed — начисление только через backend verification / SSV / server callback.
8. Если no fill / timeout / error — пробовать Provider #2.
9. Повторять до Provider #10.
10. Если все 10 failed — отправить no-fill report на backend.
11. Backend проверяет, можно ли дать emergency access.
12. Если можно — выдать 15 минут.
13. Если нельзя — показать пользователю нормальное сообщение.

Текст пользователю, если рекламы нет:
“Сейчас реклама недоступна.
Мы дали тебе 15 минут бесплатного VPN-доступа.
Попробуй позже, чтобы получить ещё 30 минут за рекламу.”

Если emergency access недоступен:
“Сейчас реклама недоступна.
Попробуйте ещё раз через несколько минут.”

Emergency Free Access:
Если все рекламные сети не дали рекламу, а баланс пользователя 0, можно выдать 15 минут.
Это не рекламная награда, а emergency_free_access.

Настройки в админке:
- emergency_access_enabled: true/false
- emergency_access_minutes: default 15
- only_if_balance_zero: true
- cooldown_hours: default 12
- max_emergency_per_day: default 1
- max_emergency_per_week: default 3
- require_all_networks_failed: true
- min_failed_networks_count: 10
- fraud_score_max
- countries_enabled
- show_reason_to_user: true/false

Anti-abuse для emergency access:
- Не давать emergency access бесконечно.
- Проверять cooldown.
- Проверять, что пользователь реально пытался загрузить рекламу.
- Проверять, что failed providers были активны.
- Проверять timestamps.
- Проверять fraud score.
- Если устройство подозрительное — emergency не выдавать.
- Если пользователь часто получает emergency access — повышать fraud score.
- Логировать все случаи.

Ad reward validation:
- Нельзя начислять минуты по client callback.
- Награда начисляется только backend-ом.
- Где возможно использовать server-side verification / server callbacks.
- Каждая reward transaction должна быть idempotent.
- transaction_id должен быть unique.
- Один callback не может начислить награду дважды.
- Нужно хранить raw callback для диагностики.
- Нужно логировать:
  - ad requested
  - ad loaded
  - ad shown
  - ad completed
  - ad failed
  - no fill
  - reward granted
  - reward rejected
  - emergency granted

Anti-fraud:
Нужно защитить проект от накрутки рекламы, модифицированных APK и эмуляторов.
Добавить:
- Play Integrity API для Android, если возможно.
- Проверку подписи приложения.
- Проверку debug build / release build.
- Проверку emulator/root признаков.
- Rate limit на ad sessions.
- Rate limit на reward attempts.
- Проверку повторных callbacks.
- Suspicious device score.
- Fraud events table.
- Возможность блокировки device_id из админки.
- Hidden cooldown для подозрительных устройств.
- Логи всех подозрительных действий.

VPN:
На старте VPN-ключи будут от поставщиков.
У меня 3-4 поставщика.
Потом, если проект вырастет, я найму команду и буду поднимать свои VPN-серверы.
Сейчас нужно сделать систему так, чтобы можно было управлять поставщиками через админку.

Форматы, которые нужно поддержать:
- happ://crypt4
- happ://crypt5, если возможно
- vless://
- vmess://
- trojan://
- wireguard config
- clash/yaml subscription
- sing-box json, если выбран sing-box

Важно:
- Реальные VPN-ключи нельзя хранить внутри APK.
- Реальные subscription links нельзя вставлять в код.
- Все ключи/ссылки хранятся на backend.
- В промптах, тестах и демо использовать только placeholders:
  HAPP_CRYPT4_PLACEHOLDER
  VLESS_PLACEHOLDER
  VMESS_PLACEHOLDER
  WIREGUARD_PLACEHOLDER
- Пользователь не должен видеть сырой VPN config.
- Пользователь видит только:
  - страна
  - флаг
  - название сервера
  - ping/ms
  - статус
  - качество сигнала
  - recommended/auto

Server quality:
Показывать качество сервера:
- зелёный: хороший ping, сервер стабилен
- оранжевый: средний ping или нагрузка
- красный: плохой ping, overload или нестабильность

Для пользователя:
- страна
- город, если есть
- название сервера
- ms
- иконка антенны
- зелёный/оранжевый/красный статус

Backend должен:
- хранить VPN providers
- хранить subscription links
- парсить сервера
- обновлять серверы по расписанию
- делать health-check серверов
- считать ping/status
- считать uptime
- видеть, какой сервер умер
- видеть трафик по серверу
- видеть трафик по пользователю
- включать/выключать сервер
- включать/выключать поставщика
- задавать приоритет поставщика
- задавать приоритет страны

Автовыбор сервера:
Кнопка “Авто” должна выбирать лучший сервер.
Формула:
score = ping + load + uptime + provider_priority + recent_failures + country_priority

Нужно объяснить и реализовать:
- как backend выбирает лучший сервер
- как client получает recommended server
- как переключать пользователя на другой сервер, если текущий плохой

VPN session:
При запуске VPN:
- backend проверяет баланс
- backend создаёт vpn_session
- backend выдаёт short-lived config/session token
- client запускает native VPN
- client отправляет heartbeat
- backend списывает минуты
- client показывает countdown
- при окончании времени VPN отключается

Важно:
- Если приложение закрыто, VPN всё равно должен отключиться после окончания времени.
- Нельзя доверять только времени телефона.
- Нужно использовать server time.
- Если телефон offline, использовать local secure countdown, потом синхронизировать с backend.
- Если пользователь меняет время телефона, это не должно давать бесплатное время.

Трафик:
У пользователя нет ограничения по трафику.
Но в админке нужно показывать:
- сколько пользователь использовал трафика
- upload
- download
- total traffic
- session duration
- страна
- сервер
- provider
- started_at
- ended_at
- disconnect reason

Нужно учитывать, что при 1000 активных пользователей:
- если каждый использует 1 час в день, нужно 2 рекламы на пользователя в день
- если каждый использует 1.5 часа в день, нужно 3 рекламы на пользователя в день
- это 60 000–90 000 rewarded ads в месяц
- VPN-трафик может быть примерно:
  - лёгкое использование: 4–7 TB/месяц
  - среднее использование: 15–22 TB/месяц
  - активное видео: 32–48 TB/месяц
  - тяжёлое HD-видео: 70–110 TB/месяц
Нужно добавить в админку финансовую аналитику, чтобы считать окупаемость.

Admin financial analytics:
В админке должен быть раздел “Экономика”:
- active users
- ads watched
- completed ads
- reward minutes granted
- emergency minutes granted
- total VPN minutes used
- total traffic used
- average traffic per user
- average ads per user
- estimated revenue
- eCPM by provider
- fill rate by provider
- no fill rate by provider
- revenue per user
- traffic cost per user
- profit/loss estimate
- projected revenue for 1000 / 5000 / 10000 users
- projected traffic for 1000 / 5000 / 10000 users
- break-even eCPM calculator

Нужно добавить калькулятор:
Inputs:
- active users
- average VPN hours per user per day
- reward minutes per ad
- eCPM
- fill rate
- average GB per hour
- traffic cost per TB
Outputs:
- ads per day
- ads per month
- expected revenue
- expected traffic TB
- estimated server/traffic cost
- profit/loss

Split tunneling:
Нужно сделать split tunneling.
На MVP можно basic version.
Пользователь должен иметь возможность:
- выбрать приложения, которые идут через VPN
- выбрать приложения, которые идут напрямую
- включить/выключить split tunneling

Если сложно для MVP, вынести в Stage 2, но архитектуру заложить сразу.

Push notifications:
Нужны push notifications и in-app banners.
Управление с backend/admin.

Типы уведомлений:
- “У тебя осталось 5 минут VPN”
- “У тебя осталась 1 минута VPN”
- “Получи ещё 30 минут бесплатно”
- “Сегодня доступен быстрый сервер”
- “Реклама снова доступна”
- “Зайди и используй VPN”
- “Новый сервер добавлен”

Требования:
- Push permission запрашивать отдельно.
- Не спамить.
- Добавить frequency cap.
- Добавить opt-out.
- Добавить language targeting.
- Добавить country targeting.
- Добавить segment targeting.

Сегменты:
- users with 0 minutes
- users with active balance
- inactive 1 day
- inactive 3 days
- inactive 7 days
- users who got emergency access
- users who saw no ad
- users with old app version
- Russian language
- Turkish language
- Turkmen language

In-app banners:
Админ должен создавать баннеры:
- title
- body
- image/icon optional
- language
- target segment
- start date
- end date
- priority
- enabled
- deeplink action

UI/UX:
Дизайн должен быть premium, быстрый и чистый.
Вдохновение:
- Telegram Premium
- Proton VPN
- Hiddify
- AdGuard VPN
- Binance

Стиль:
- dark mode first
- light mode тоже нужен
- premium gradients
- красивые карточки
- плавные анимации
- минимум тяжёлого blur
- не перегружать интерфейс
- всё должно летать на слабых телефонах
- 60 FPS goal
- Reanimated для анимаций
- Lottie только маленькие и оптимизированные
- fallback для слабых устройств

Главные экраны приложения:
1. Splash screen
2. Language selection
3. Onboarding
4. Privacy / Terms
5. VPN permission screen
6. Push permission screen
7. Home screen
8. Rewarded ad screen
9. Ad loading / fallback screen
10. Emergency access screen
11. Server list
12. Connected screen
13. Split tunneling screen
14. Usage history
15. Rewards history
16. Settings
17. Support
18. About / Privacy Policy

Home screen:
- большой animated connect button
- selected server
- remaining time
- “Смотреть рекламу +30 минут”
- “Выбрать сервер”
- signal quality
- in-app banner
- small status cards:
  - VPN status
  - ping
  - traffic today
  - balance

Connected screen:
- animated shield
- country flag
- server name
- ping
- countdown
- upload/download
- disconnect button
- watch ad to extend button

Server list:
- auto server on top
- search
- countries
- server quality colors
- ping/ms
- antenna icon
- provider hidden from user
- favorites optional

Settings:
- language
- theme
- notifications
- split tunneling
- privacy
- support
- app version

Admin panel:
Нужна полноценная админка.

Admin stack:
- React + Vite
- TypeScript
- TailwindCSS
- TanStack Query
- Zustand или Redux Toolkit
- Charts
- Premium dark/light UI

Admin sections:

1. Dashboard:
- total installs
- active today
- active VPN sessions
- total ad views
- completed ads
- no fill rate
- estimated revenue
- total VPN traffic
- top countries
- bad servers
- emergency access count
- fraud alerts

2. Devices:
- device_id
- language
- country
- app version
- current balance
- total ads watched
- total VPN minutes
- total traffic
- fraud score
- last seen
- block/unblock
- view sessions
- view rewards
- view emergency access logs

3. VPN Providers:
- add/edit/delete provider
- provider name
- provider type
- subscription URL
- happ/vless/vmess/trojan/wireguard/clash
- priority
- enabled/disabled
- last sync
- sync status
- server count
- error logs

4. VPN Servers:
- country
- city
- server name
- flag
- ping
- status
- quality color
- provider
- traffic
- active sessions
- uptime
- enable/disable
- manual priority

5. Ads:
- list of 10 ad providers
- enable/disable provider
- priority
- dynamic priority by eCPM
- ad unit ids
- timeout
- country rules
- fill rate
- no fill rate
- eCPM
- revenue estimate
- waterfall logs

6. Emergency Access:
- enable/disable
- minutes default 15
- only if balance zero
- cooldown hours
- max per day
- max per week
- countries
- fraud score max
- logs
- total emergency minutes
- estimated lost revenue

7. Notifications:
- create push notification
- create in-app banner
- language targeting
- country targeting
- segment targeting
- schedule
- preview
- sent count
- opened count

8. Remote Config:
- reward minutes per ad
- emergency minutes
- ad waterfall order
- maintenance mode
- force update
- minimum app version
- feature flags
- split tunneling enabled
- max balance days
- hidden anti-fraud limits

9. Fraud:
- suspicious devices
- modified APK attempts
- emulator/root
- repeated callbacks
- abnormal ad views
- abnormal emergency usage
- block device
- fraud event logs

10. Economy:
- users
- ads
- revenue
- traffic
- cost
- profit/loss
- break-even eCPM
- projections for 1000/5000/10000 users

11. Logs:
- admin audit logs
- reward logs
- VPN session logs
- ad logs
- no fill logs
- backend errors

Database:
Нужно спроектировать MySQL schema.

Required tables:
- devices
- device_sessions
- push_tokens
- minute_ledger
- reward_transactions
- ad_providers
- ad_sessions
- ad_provider_events
- ad_waterfall_configs
- emergency_access_logs
- vpn_providers
- vpn_subscription_sources
- vpn_servers
- vpn_server_health
- vpn_sessions
- vpn_usage_stats
- notification_campaigns
- notification_logs
- in_app_banners
- app_settings
- remote_config
- fraud_events
- admins
- admin_roles
- admin_audit_logs

Нужно дать SQL schema с индексами.
Нужно учесть:
- idempotency
- transaction_id unique
- device_id indexes
- created_at indexes
- provider_id indexes
- session status indexes

API:
Нужно спроектировать REST API.

Client API:
- POST /api/device/register
- POST /api/device/push-token
- POST /api/device/heartbeat
- GET /api/app/config
- GET /api/rewards/balance
- GET /api/rewards/history
- POST /api/ads/session/start
- GET /api/ads/waterfall-config
- POST /api/ads/provider-event
- POST /api/ads/no-fill-report
- POST /api/rewards/admob/ssv
- POST /api/rewards/applovin/callback
- POST /api/rewards/levelplay/callback
- GET /api/vpn/servers
- GET /api/vpn/recommended
- POST /api/vpn/session/start
- POST /api/vpn/session/heartbeat
- POST /api/vpn/session/stop
- GET /api/vpn/session/current
- POST /api/vpn/usage
- GET /api/notifications/in-app
- POST /api/events

Admin API:
- POST /api/admin/login
- POST /api/admin/logout
- GET /api/admin/me
- GET /api/admin/dashboard
- GET /api/admin/devices
- GET /api/admin/devices/:id
- POST /api/admin/devices/:id/block
- POST /api/admin/devices/:id/unblock
- CRUD /api/admin/vpn/providers
- CRUD /api/admin/vpn/servers
- POST /api/admin/vpn/providers/:id/sync
- CRUD /api/admin/ads/providers
- PUT /api/admin/ads/providers/:id/priority
- PUT /api/admin/ads/providers/:id/toggle
- GET /api/admin/ads/dashboard
- GET /api/admin/ads/no-fill-logs
- PUT /api/admin/emergency-access/settings
- GET /api/admin/emergency-access/logs
- CRUD /api/admin/notifications
- CRUD /api/admin/banners
- GET /api/admin/economy
- POST /api/admin/economy/calculate
- CRUD /api/admin/remote-config
- GET /api/admin/fraud
- GET /api/admin/logs

Project folder structure:
Нужно предложить структуру:

/apps/mobile
/apps/admin
/apps/backend
/packages/shared
/packages/types
/packages/config

Mobile:
- src/screens
- src/components
- src/features/vpn
- src/features/ads
- src/features/rewards
- src/features/servers
- src/features/notifications
- src/features/settings
- src/native/vpn
- src/api
- src/store
- src/i18n
- src/theme
- src/utils

Backend:
- src/modules/device
- src/modules/ads
- src/modules/rewards
- src/modules/vpn
- src/modules/notifications
- src/modules/admin
- src/modules/fraud
- src/modules/economy
- src/modules/remote-config
- src/db
- src/queues
- src/workers
- src/middleware
- src/utils

Admin:
- src/pages
- src/components
- src/features/dashboard
- src/features/devices
- src/features/vpn
- src/features/ads
- src/features/emergency
- src/features/notifications
- src/features/economy
- src/features/fraud
- src/api
- src/store
- src/theme

Security:
- TLS everywhere
- No secrets in APK
- VPN configs encrypted at rest
- Short-lived VPN session configs
- Admin login secure
- Admin audit logs
- Rate limiting
- Input validation
- Env variables
- Separate production/staging
- Error logging
- Never log raw user traffic content
- Log only technical metadata:
  - duration
  - server id
  - bytes in/out
  - disconnect reason

Privacy:
Нужно подготовить privacy policy requirements:
- VPN app must explain what data is collected
- no browsing history logging
- no traffic content logging
- collect only device_id, app events, ad events, VPN session metadata, traffic totals
- explain rewarded ads
- explain push notifications
- explain anonymous device profile

Performance:
Приложение должно быть лёгким.
Нельзя:
- постоянно пинговать все серверы с телефона
- делать polling каждую секунду
- хранить огромные логи на телефоне
- делать тяжёлые анимации
- грузить 10 ad SDK без контроля размера

Нужно:
- backend health-check серверов
- кешированный server list
- preload ads
- remote config
- low-end mode
- offline-safe countdown
- minimal startup time
- crash reporting

Scaling:
Для 10 000 установок:
- backend stateless
- Redis для rate limit/cache/session
- workers для health checks, notifications, provider sync
- MySQL indexes
- log rotation
- monitoring
- alerts
- admin dashboard for active sessions
- no excessive polling

MVP roadmap:

Stage 1 — Foundation:
- React Native Android app
- backend
- MySQL schema
- device register
- language selection
- basic UI
- remote config

Stage 2 — Rewarded ads:
- AdMob test ads
- ad session
- SSV/backend reward
- +30 minutes ledger
- balance screen

Stage 3 — VPN:
- Android VpnService
- sing-box integration
- server list
- connect/disconnect
- countdown
- auto disconnect

Stage 4 — Admin:
- admin login
- dashboard
- devices
- balance/reward logs
- VPN providers
- servers

Stage 5 — Ad waterfall:
- 10 ad providers architecture
- mediation
- provider priority
- no fill logs
- fallback logic
- emergency 15 minutes

Stage 6 — Notifications:
- FCM
- push campaigns
- in-app banners
- language/segment targeting

Stage 7 — Analytics/Economy:
- traffic stats
- ad stats
- revenue estimate
- eCPM
- fill rate
- break-even calculator

Stage 8 — Anti-fraud:
- Play Integrity
- root/emulator checks
- fraud score
- block device
- callback validation

Stage 9 — Optimization:
- low-end device mode
- app size optimization
- startup optimization
- animation optimization
- bad internet handling

Stage 10 — Public testing:
- APK test with 50 users
- 100 users
- 500 users
- 1000 users
- fix crashes
- measure fill rate
- measure traffic
- measure revenue
- prepare Google Play later

Нужно выдать мне:
1. Полную архитектуру проекта.
2. Какой стек выбрать и почему.
3. Почему обычный Expo Go не подходит.
4. Bare React Native vs Expo Prebuild — что лучше.
5. Какой VPN core выбрать.
6. Как интегрировать Android VpnService.
7. Как хранить и выдавать VPN configs.
8. Как парсить happ/vless/vmess/trojan/wireguard/clash.
9. Как сделать rewarded ads.
10. Как сделать 10 ad providers waterfall.
11. Как сделать emergency 15 минут.
12. Как сделать серверный баланс без регистрации.
13. Как сделать admin panel.
14. Как сделать MySQL schema.
15. Как сделать API.
16. Как сделать push notifications.
17. Как сделать split tunneling.
18. Как сделать traffic analytics.
19. Как сделать revenue/traffic calculator.
20. Как защититься от fraud.
21. Как масштабировать до 10 000 пользователей.
22. Какой MVP делать первым.
23. Какие риски у APK и Google Play.
24. Что нельзя делать.
25. Sprint plan по неделям.
26. Production checklist.

Не задавай слишком много общих вопросов.
Если информации хватает — принимай разумные технические решения сам.
Где есть риск — объясни риск и дай лучший вариант.
Пиши как техническое ТЗ для реальной разработки.