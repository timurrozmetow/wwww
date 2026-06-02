# CLAUDE.md

> Операционная инструкция для Claude Code по проекту **free-vpn-rewards** (рабочее имя, можно переименовать).
> **Прочитай этот файл целиком перед началом работы. Всё, что отмечено «РЕШЕНО», не переобсуждается — просто реализуй.**
> Полное продуктовое ТЗ лежит в `docs/SPEC.md` (это исходный промпт). CLAUDE.md — это как работать, SPEC.md — что именно строить.

---

## 0. Как работать (САМОЕ ВАЖНОЕ)

**Принцип: не спрашивай — делай.** Этот файл уже содержит ключевые решения. Если чего-то не хватает — прими разумное техническое решение сам и оставь короткий комментарий `// ASSUMPTION: ...` рядом с кодом.

**Останавливайся и спрашивай ТОЛЬКО когда:**
1. Нужен реальный секрет/доступ, который есть только у владельца (ключ API, subscription URL, ad unit id, FCM service account, прод-пароль БД). → **Не спрашивай. Поставь placeholder, добавь строку в `.env.example` и продолжай.**
2. Решение напрямую меняет денежную логику (начисление/списание минут, выдача emergency, валидация reward), а ТЗ в этом месте реально противоречит само себе.
3. Действие разрушительное: `DROP TABLE`, удаление файлов пользователя, force-push, чистка миграций.

Во всех остальных случаях — **решай, реализуй, фиксируй допущение**.

**Ритм работы:**
- Двигайся по этапам из раздела 10 (Roadmap). Не пытайся написать всё приложение за один проход.
- Маленькие осмысленные коммиты с понятными сообщениями (`feat(backend): minute ledger`, `fix(mobile): countdown drift`).
- После каждого заметного изменения: `typecheck` + `lint` + сборка затронутого приложения. Что сломал — чини сам.
- Веди прогресс в `docs/PROGRESS.md`: что сделано, что дальше, какие допущения принял.
- Не оставляй `TODO` без записи в `PROGRESS.md`.

---

## 1. Что это за проект

Бесплатное Android VPN-приложение для рынка **Туркменистана** (слабый/нестабильный интернет). Монетизация — **rewarded-реклама**: 1 досмотренная реклама = **30 минут VPN**. Минуты копятся до **1 года**. Регистрации нет — используется **анонимный device profile** (`device_id`). Баланс — на бэкенде (источник правды), на телефоне только кеш.

Три приложения в монорепо: мобильный клиент (RN), бэкенд (Node), админка (React+Vite).

---

## 2. Технологический стек (РЕШЕНО)

| Слой | Технология | Кратко почему |
|---|---|---|
| Монорепо | **pnpm workspaces + Turborepo** | быстрый кеш сборок, общие пакеты |
| Mobile | **React Native + TypeScript** | под навыки владельца |
| Mobile workflow | **Expo Prebuild / Development Build** | см. раздел 3 |
| VPN native | **Kotlin + Android `VpnService`** | обязательная нативная часть |
| VPN core | **sing-box** | см. раздел 3 |
| Ads mediation | **AppLovin MAX** | см. раздел 3 |
| Backend | **Node.js + TypeScript + Fastify** | schema-валидация из коробки, быстрее Express |
| DB | **MySQL** | под навыки владельца |
| ORM/миграции | **Drizzle ORM + drizzle-kit** | TS-first, полный контроль над SQL и индексами |
| Cache/sessions/rate-limit | **Redis** (ioredis) | — |
| Очереди/джобы | **BullMQ** (на Redis) | health-check, push, sync провайдеров |
| Admin | **React + Vite + TS + TailwindCSS** | под навыки владельца |
| Data fetching | **TanStack Query** (mobile + admin) | кеш, ретраи под плохой интернет |
| State | **Zustand** (mobile + admin) | лёгкий, без бойлерплейта |
| Анимации | **Reanimated 3** + **Lottie** (только мелкие/оптимизированные) | 60 FPS на слабых телефонах |
| Навигация | **React Navigation** (native stack) | — |
| i18n | **i18next + react-i18next**, языки `ru` / `tr` / `tk` | — |
| Push | **FCM** | — |
| Тесты | **Vitest** | — |
| Линт/формат | **ESLint + Prettier** (strict TS) | — |

Не предлагай замену стека без явной причины (баг, несовместимость, EOL). Версии SDK проверяй на актуальность в момент интеграции — могли выйти новые.

---

## 3. Ключевые архитектурные решения (РЕШЕНО — с обоснованием)

**Почему не Expo Go:** Expo Go не позволяет линковать кастомный нативный код. VPN требует Android `VpnService` + интеграцию sing-box → Expo Go не подходит для production. Точка.

**Expo Prebuild (Development Build), а не Bare RN:** оставляем DX Expo (config plugins, EAS, OTA для JS-части), но получаем полный доступ к нативу через **local native module + config plugin** для VPN-слоя. Bare RN дал бы то же самое, но ручного обслуживания нативной конфигурации больше. Вывод: **Expo Prebuild + кастомный нативный модуль `vpn` (Kotlin)**.

**VPN core — sing-box:** один core закрывает vless/vmess/trojan/shadowsocks/wireguard, имеет mux и устойчив к нестабильной сети. Альтернативы (xray, отдельный wg) дробят кодовую базу. sing-box — оптимально под «много форматов + плохой интернет».

**Mediation — AppLovin MAX:** лучший fill rate и eCPM на развивающихся рынках, тянет AdMob/Unity/Pangle/Mintegral/InMobi/Vungle/Chartboost как demand через свой waterfall. Под старт в Туркменистане и APK-тест — MAX. Бэкенд всё равно отдаёт порядок waterfall через remote config, чтобы менять приоритеты без релиза.

---

## 4. Структура монорепо

```
/
├── apps/
│   ├── mobile/      # React Native (Expo prebuild) + TS
│   ├── backend/     # Fastify + TS
│   └── admin/       # React + Vite + TS + Tailwind
├── packages/
│   ├── shared/      # утилиты, общая логика (валидация, форматирование)
│   ├── types/       # общие TS-типы: API contracts, enums, DTO
│   └── config/      # общие конфиги eslint/tsconfig/tailwind
├── docs/
│   ├── SPEC.md      # полное ТЗ
│   └── PROGRESS.md  # журнал работы (веди его)
├── pnpm-workspace.yaml
├── turbo.json
└── CLAUDE.md
```

Внутренняя структура apps — как в SPEC.md (раздел «Project folder structure»). **Все API-контракты, enum'ы статусов, типы ledger/событий — только в `packages/types`**, чтобы mobile/backend/admin не расходились.

---

## 5. Команды

```bash
pnpm install                      # установка всего монорепо
pnpm dev                          # turbo: все приложения в dev
pnpm build                        # сборка всех
pnpm typecheck                    # проверка типов везде
pnpm lint                         # eslint везде
pnpm test                         # vitest везде

# по приложению:
pnpm --filter backend dev
pnpm --filter backend db:generate # drizzle: сгенерировать миграцию
pnpm --filter backend db:migrate  # применить миграции
pnpm --filter admin dev
pnpm --filter mobile prebuild     # expo prebuild (генерит android/)
pnpm --filter mobile android      # запуск dev build на устройстве/эмуляторе
```

Если команды ещё не заведены — заведи их в соответствующих `package.json` при первом обращении. Не придумывай несуществующие скрипты — сначала создай.

---

## 6. Правила по приложениям

**mobile**
- Dark mode first, есть light. Premium-стиль (Proton VPN / Telegram Premium / Hiddify как референс), но без тяжёлого blur.
- Анимации — Reanimated на UI-потоке. Lottie — только маленькие. Всегда есть `lowEndMode` fallback (отключает дорогие эффекты).
- **Никакого polling каждую секунду.** Server list кешируется. Пинг серверов считает бэкенд, не телефон.
- Countdown минут работает offline (secure local countdown), затем синхронизируется с бэкендом. Используй **серверное время** как источник правды (см. инварианты).
- Баланс на телефоне — только кеш для быстрого UI. Реальные операции — через API.

**backend**
- Fastify + JSON schema на каждый роут (валидация入/выхода).
- Все денежные операции — атомарно, через **minute_ledger** (раздел 7).
- Reward-коллбэки (AdMob SSV, AppLovin, LevelPlay) — **идемпотентны** по `transaction_id`. Сырой callback сохраняй для диагностики.
- Health-check серверов, sync провайдеров, рассылки push — через **BullMQ workers**, не в HTTP-хендлерах.
- Логируй технические метаданные (duration, server_id, bytes in/out, disconnect_reason). **Никогда — содержимое трафика пользователя.**

**admin**
- TanStack Query + Zustand, Tailwind, charts. Разделы — по SPEC.md (Dashboard, Devices, VPN Providers/Servers, Ads, Emergency, Notifications, Remote Config, Fraud, Economy, Logs).
- Экономический калькулятор и проекции (1000/5000/10000 юзеров) — по формулам из SPEC.md.
- Все админ-действия пишутся в `admin_audit_logs`.

---

## 7. Критичные инварианты (НИКОГДА не нарушать)

1. **Placeholders для секретов.** Реальные VPN-ключи, subscription URL, ad unit id, токены — **никогда в коде**. Только в `.env` (+ `.env.example` с заглушками). В коде/тестах/демо использовать строго: `HAPP_CRYPT4_PLACEHOLDER`, `VLESS_PLACEHOLDER`, `VMESS_PLACEHOLDER`, `TROJAN_PLACEHOLDER`, `WIREGUARD_PLACEHOLDER`.
2. **Пользователь никогда не видит сырой VPN-config.** Только: страна, флаг, имя сервера, ping, статус, качество (зелёный/оранжевый/красный), auto/recommended.
3. **Reward начисляется ТОЛЬКО бэкендом**, по server-side verification / callback. Client-side completion награду не даёт. Закрыл/пропустил рекламу — награды нет.
4. **Идемпотентность.** `transaction_id` unique. Один callback не может начислить дважды.
5. **Баланс = сумма ledger.** Любое изменение минут — это запись в `minute_ledger` (`reward_ad +30`, `emergency_free_access +15`, `vpn_usage -N`, `admin_adjustment ±`, `fraud_reversal -`, `expired_minutes -`). Кеш баланса можно держать, но он производный.
6. **Серверное время — истина.** Смена времени на телефоне не даёт бесплатных минут. VPN отключается по времени даже если приложение закрыто.
7. **Emergency access** выдаётся только если: баланс = 0, все включённые сети реально не дали fill, соблюдён cooldown и лимиты, fraud_score в норме. Всё логируется и видно в админке.
8. **VPN session token — short-lived.** Бэкенд проверяет баланс перед стартом сессии.
9. **Не пиши в ledger на каждый heartbeat.** Usage-списание агрегируй через Redis, сбрасывай в `minute_ledger` батчем (подробно — раздел 14).

---

## 8. Конвенции кода

- Strict TypeScript, без `any` (если без него никак — `// eslint-disable` + причина).
- Имена файлов: `kebab-case`. Компоненты: `PascalCase`. Хуки: `useXxx`.
- Общие типы и контракты — в `packages/types`, импорт оттуда, не дублировать.
- Ошибки API — единый формат `{ error: { code, message } }`. Коды — enum в `packages/types`.
- Никаких magic numbers для бизнес-правил (30 мин, 15 мин, cooldown) — выноси в `remote_config` / константы.
- Комментарии и UI-тексты пользователя: `ru`/`tr`/`tk` через i18next, не хардкодить строки в JSX.

---

## 9. Безопасность и приватность

- TLS везде. Секреты — только из env. VPN-конфиги шифруются at rest.
- Anti-fraud: Play Integrity (где доступно), проверка подписи APK, debug/release, эвристики emulator/root, rate-limit на ad/reward, `fraud_events`, блок `device_id` из админки, скрытый cooldown подозрительным.
- Приватность: не логируем историю браузинга и содержимое трафика. Собираем только: `device_id`, события приложения/рекламы, метаданные VPN-сессий, суммарный трафик. Privacy policy — по требованиям из SPEC.md.

---

## 10. Roadmap (порядок работ — следуй ему)

1. **Foundation** — монорепо, backend skeleton, MySQL schema + миграции, `/device/register`, выбор языка, базовый UI, remote config. Сразу подключи Sentry и Redis с AOF (раздел 14).
2. **Rewarded ads** — AdMob test ads → ad session → backend reward (SSV) → `+30` в ledger → экран баланса.
3. **VPN** — `VpnService` + sing-box, server list, connect/disconnect, countdown, авто-отключение.
4. **Admin** — логин, dashboard, devices, reward/ledger logs, VPN providers/servers.
5. **Ad waterfall** — 10 провайдеров через MAX, приоритеты, no-fill logs, fallback, emergency 15 мин.
6. **Notifications** — FCM, кампании, in-app banners, таргетинг по языку/сегменту/стране.
7. **Analytics / Economy** — трафик, реклама, revenue estimate, eCPM, fill rate, break-even калькулятор.
8. **Anti-fraud** — Play Integrity, root/emulator, fraud score, блок устройства, валидация callbacks.
9. **Optimization** — low-end mode, размер APK, старт, анимации, поведение при плохом интернете.
10. **Public testing** — APK на 50 → 100 → 500 → 1000 юзеров, фикс крашей, замеры fill/трафика/revenue.

**Сейчас начинай со Stage 1.** Не перескакивай вперёд без причины, но закладывай архитектуру так, чтобы следующие этапы вставали без переписывания (особенно ledger, remote config, split tunneling — интерфейсы заложить сразу, реализацию split tunneling можно в Stage позже).

---

## 11. Definition of Done (для каждой фичи)

- Типы в `packages/types`, реализация в нужном app.
- `typecheck` + `lint` чисто, сборка проходит.
- Денежная логика покрыта тестами (Vitest): идемпотентность, граничные случаи (баланс 0, истечение, двойной callback).
- Нет хардкодженных секретов; добавлены строки в `.env.example`.
- Запись в `docs/PROGRESS.md`.

---

## 12. Что НЕЛЬЗЯ делать

- Класть реальные ключи/ссылки/секреты в код или коммиты.
- Начислять reward на стороне клиента.
- Доверять времени телефона для биллинга минут.
- Пинговать все серверы с телефона / делать polling каждую секунду / держать огромные логи на устройстве.
- Грузить 10 ad SDK напрямую (только через mediation).
- Показывать пользователю сырой VPN-config.
- Логировать содержимое пользовательского трафика.
- Делать разрушительные операции с БД/файлами без явного подтверждения.

---

## 13. Что хранится вне кода (`.env`, заводит владелец)

`DATABASE_URL`, `REDIS_URL`, FCM service account, ad unit ids (AdMob/MAX/...), MAX SDK key, реальные VPN subscription URLs, JWT secret админки, Play Integrity ключи.
→ При первой надобности добавь ключ в `.env.example` с заглушкой и продолжай работу на placeholder'ах. Не блокируйся из-за их отсутствия.

---

## 14. Масштабирование и стоимость (закладывай с Stage 1)

**Контекст:** стека (Node/Fastify/MySQL/Redis) хватает на 10 000 установок с огромным запасом — это лёгкая нагрузка. Бэкенд = **control plane** (метаданные: баланс, сессии, реклама, конфиги), а сам VPN-трафик идёт **через серверы поставщиков, мимо бэкенда**. Поэтому реальные риски — не во фреймворках, а в паттернах данных и в стоимости трафика. Соблюдай правила ниже, чтобы потом не переписывать.

1. **Ledger — агрегируй, не пиши на каждый heartbeat.** Списание VPN-минут (`vpn_usage`) веди непрерывно в Redis, а в `minute_ledger` сбрасывай батчем — раз в N минут или при остановке сессии. Reward (`+30`) и emergency (`+15`) пиши сразу (их мало). Это главная ловушка по нагрузке на MySQL — не допусти строку ledger на каждый пинг.

2. **Heartbeat — не чаще раза в 20–30 сек.** Точность авто-отключения держи за счёт **серверного дедлайна сессии** (бэкенд заранее знает момент исчерпания минут), а не за счёт частоты пингов. Частый heartbeat = лишняя нагрузка + расход батареи на слабых телефонах.

3. **Redis с персистентностью (AOF включён).** В нём живут сессии, live-баланс, countdown, rate-limit и anti-fraud счётчики — их нельзя терять при рестарте.

4. **Наблюдаемость обязательна.** Заложи **Sentry** (crash reporting на mobile + ошибки бэкенда) и базовые метрики + алерты с самого начала. На 10k без мониторинга работа вслепую. Это приоритетнее любой «продвинутой» архитектуры.

5. **Bandwidth — это реальное узкое место и главный расход.** 4–110 ТБ/месяц упираются в деньги, а не в Fastify. Поэтому break-even калькулятор по eCPM, health-check серверов и автоотключение мёртвых/перегруженных поставщиков (раздел Economy в SPEC.md) — инструменты выживания проекта, а не второстепенные фичи. Реализуй их добросовестно.

6. **Stateless-бэкенд — ради отказоустойчивости, не ради throughput.** Держи бэкенд stateless (состояние в Redis/MySQL), чтобы можно было запустить 2+ инстанса за load balancer для надёжности. Одного приличного инстанса по производительности на 10k хватает.

**НЕ делай на этом масштабе (over-engineering):** Kubernetes, микросервисы, шардинг MySQL, Cassandra/прочие экзотические БД, read-replica «на всякий случай». Это сожжёт время без пользы. Read-replica и горизонтальное масштабирование БД — только когда реально упрёшься в метрики, не раньше.
