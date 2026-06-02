# BUILD.md — сборка и публикация мобильного приложения

> Как собрать устанавливаемый Android APK/AAB. Сама сборка запускается на машине
> владельца или в EAS-облаке — в dev-песочнице Android SDK нет.

## TL;DR

```bash
# из apps/mobile
pnpm --filter @vpn/mobile prebuild        # генерит android/ из app.config.ts
pnpm --filter @vpn/mobile build:preview   # EAS: внутренний APK для теста
```

Конфиг приложения — **`app.config.ts`** (динамический, читает env). `app.json` удалён.
Профили сборки — **`eas.json`**. Секреты/endpoint'ы НЕ коммитятся (CLAUDE.md §7/§13).

---

## 0. Что соберётся на каждом этапе

| Этап                                    | Что работает                                                                                          | Блокер                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **A. control-plane APK** (готов сейчас) | язык, регистрация, **тестовая реклама → +30 мин**, баланс, баннеры, low-end, поведение на плохой сети | кнопка «Подключиться» выключена                                             |
| **B. full VPN APK**                     | реальный VPN-туннель, авто-отключение                                                                 | нужен нативный модуль (`modules/vpn`) + `libbox.aar` — см. [VPN.md](VPN.md) |

## 1. Предварительные требования

- **Node + pnpm**, установлен монорепо (`pnpm install`).
- **EAS CLI** (облачная сборка, локальный Android SDK НЕ нужен): `npm i -g eas-cli`, затем `eas login`, `eas init` (заполнит `EAS_PROJECT_ID`).
- ИЛИ **локальная сборка**: JDK 17 + Android SDK (`ANDROID_HOME`), устройство/эмулятор.
- **Задеплоенный бэкенд**, доступный с телефона. `10.0.2.2` работает только на эмуляторе; реальному устройству нужен публичный URL (твой сервер или туннель `ngrok http 3000` для теста).

## 2. Переменные окружения (mobile)

`EXPO_PUBLIC_*` встраиваются в бандл (НЕ секретны). Задаются per-profile в `eas.json`
или в `.env` (см. `.env.example`):

| Переменная                         | Назначение                                      |
| ---------------------------------- | ----------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`         | базовый URL бэкенда (телефон → API)             |
| `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` | AdMob **app** id (по умолчанию тестовый Google) |
| `EAS_PROJECT_ID`                   | заполняется `eas init`                          |

Реальные ad unit ids / MAX SDK key для production — через **EAS secrets**
(`eas secret:create`), не в репозитории.

## 3. Этап A — собрать control-plane APK

**Вариант EAS (рекомендуется):**

```bash
# поправь EXPO_PUBLIC_API_BASE_URL в eas.json (профиль preview) на адрес бэкенда
pnpm --filter @vpn/mobile build:preview
```

EAS вернёт ссылку на `.apk` — скачай и поставь на телефон (`adb install app.apk` или открыть ссылку на устройстве).

**Вариант локально:**

```bash
pnpm --filter @vpn/mobile prebuild
EXPO_PUBLIC_API_BASE_URL=https://<твой-бэкенд> pnpm --filter @vpn/mobile android
```

### Чек-лист теста (Этап A)

- [ ] выбор языка ru/tr/tk сохраняется;
- [ ] устройство регистрируется (виден в админке Devices);
- [ ] «Смотреть рекламу» → тестовый ролик → SSV-callback → **+30 мин** в балансе;
- [ ] баннеры из админки появляются на Home;
- [ ] low-end тумблер сохраняется, баланс рефетчится реже;
- [ ] выключи сеть → приложение не висит (таймаут 15с), показывает кеш; включи → восстанавливается.

## 4. Этап B — full VPN APK

1. Реализуй нативный модуль `modules/vpn` (скелет готов) + добавь `libbox.aar` — см. [VPN.md](VPN.md).
2. `pnpm --filter @vpn/mobile prebuild:clean` (перегенерит `android/` с VPN-сервисом и permission'ами из манифеста модуля).
3. Собери `build:preview`, протестируй коннект/трафик/авто-отключение.

## 5. Production-релиз (Play Store)

1. **Реальные ключи**: `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`, MAX SDK key, реальный `EXPO_PUBLIC_API_BASE_URL` → как EAS secrets; реальные ad unit ids на бэкенде (`ad_providers`) и в env.
2. **Подпись**: `eas credentials` (EAS управляет keystore) или свой keystore. НЕ коммить keystore.
3. **AAB**: `pnpm --filter @vpn/mobile build:prod` (профиль production → `app-bundle`, `autoIncrement` поднимает versionCode).
4. **Submit**: `pnpm --filter @vpn/mobile submit:prod` (нужен Google Play service account JSON в EAS).
5. **Privacy / Data safety** в Play Console: заявить, что собираем `device_id`, события рекламы/сессий, суммарный трафик; **НЕ** собираем содержимое трафика/историю (CLAUDE.md §9).
6. `ADMOB_SSV_VERIFY=true` на бэкенде; проверить, что reward начисляется только по верифицированному SSV.
7. Поэтапная раскатка: 50 → 100 → 500 → 1000 (Stage 10), замеры fill rate / трафика / revenue.

## 6. Чего НЕ делать

- Не коммить реальные ad unit ids / MAX key / keystore / service account — только EAS secrets / `.env`.
- Не указывать `localhost`/`10.0.2.2` в production-профиле.
- Не включать `ADMOB_SSV_VERIFY=false` в проде.
