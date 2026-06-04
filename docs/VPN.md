# VPN.md — нативный VPN-модуль (Kotlin + sing-box)

> Архитектура и шаги доведения нативного VPN до рабочего состояния (Этап B).
> **Бэкенд-конвейер «happ-ссылка → sing-box config» уже готов и покрыт тестами**
> (см. ниже). Остался нативный туннель (libbox.aar + сборка на устройстве).
>
> **СТАТУС нативного модуля: ВРЕМЕННО ОТКЛЮЧЁН** — файл автолинковки переименован
> в `expo-module.config.json.disabled`, Gradle его не компилирует. **Чтобы
> включить:** вендори `libbox.aar` (см. §AAR), переименуй обратно в
> `expo-module.config.json`, затем `prebuild:clean` + сборка на устройстве.

## Конвейер «paste happ-ссылку → серверы» (БЭКЕНД, готов)

```
admin вставляет источник                       backend (apps/backend/src/modules/vpn)
─────────────────────────                      ──────────────────────────────────────
happ://crypt4/… | https://sub… | vless://…  ─▶ subscription.ts  resolveSubscription()
                                                  ├─ happ-decoder.ts   decodeHappLink()  (BYOK env keys)
                                                  ├─ (sub-URL? fetch : inline)
                                                  └─ proxy-parser.ts   parseSubscription() → ProxyConfig[]
                                                singbox-config.ts buildSingBoxConfigJson(proxy)
                                                  → configBlob (tun + outbound + route)
admin-vpn.service.ts importFromSource() ──────▶ создаёт vpn_servers (configBlob, host, country)
```

- **happ-decoder.ts** — свой аудированный декодер (`node:crypto`, без npm-зависимости). RSA PKCS#1 v1.5, **блочная цепочка** (128 Б для crypt RSA-1024, 512 Б для crypt2/3/4 RSA-4096), URL-safe base64. Ключи — **только из env** (`HAPP_PRIVATE_KEY_CRYPT*`, BYOK, §7.1), в коде нет ни одного ключа. crypt5 (ChaCha20-Poly1305) не поддержан — внятная ошибка `unsupported_version`.
- **Ключи Happ** — публичные (извлечены сообществом из клиента, инертны: приватный RSA-ключ только дешифрует). Установка: `pnpm --filter @vpn/backend happ:key crypt4 --env >> deploy/.env.production` (скрипт `scripts/fetch-happ-key.mjs` тянет ключ из публичного репо в рантайме, в исходниках ключа нет). Проверено: ключ — RSA-4096, декодер round-trip'ит реальный ключ.
- **proxy-parser.ts / singbox-outbound.ts / singbox-config.ts** — vless/vmess/trojan/ss → нормализованный `ProxyConfig` → sing-box outbound → полный config. Схема **sing-box 1.11+** (валидна до 1.13.x): `tun.address` (не `inet4_address`), `sniff`/`hijack-dns` в route-actions, без `block`/`dns` outbounds и geoip.
- Источник пасты — экран **Admin → VPN → Import servers** (`POST /api/admin/vpn/import`). Страна определяется из имени (флаг-эмодзи / 2-буквенный код), иначе fallback из формы.

## Архитектура нативного слоя (CLAUDE.md §3)

```
JS (app)                 modules/vpn (Expo local module)            Android OS / libbox
────────                 ──────────────────────────────            ───────────────────
useVpn() ─ start(cfg) ─▶ VpnModule.kt (bridge) ─ startService ─▶ VpnTunnelService : VpnService, PlatformInterface
   ▲                         │  onStatusChange ◀── statusListener     │  Libbox.newService(config, this).start()
   │                         ▼                                        ▼  core ВЫЗЫВАЕТ openTun(TunOptions)
status events           Expo Modules API                         openTun → Builder.establish() → fd → core
```

**Ключевой момент (проверено по SFA / experimental/libbox):** на Android **libbox
сам НЕ открывает tun**. Наш config содержит `tun` inbound; core превращает его в
`TunOptions` и зовёт `openTun()`, где **мы** строим `VpnService.Builder`,
`establish()` и возвращаем fd. Мы НЕ создаём fd заранее и НЕ кладём числовой fd в
JSON. Сокеты ядра защищаются через `autoDetectInterfaceControl(fd) → protect(fd)`,
иначе исходящие к VPN-серверу попадут в tun (петля / нет трафика).

## Инварианты (НЕ нарушать)

1. **Сырой sing-box config НЕ виден пользователю и не логируется** (§7.2). Приходит с бэкенда как opaque-строка, уходит прямо в core. В UI — только страна/флаг/имя/ping.
2. **Старт сессии — только после проверки баланса** (§7.8): short-lived `sessionToken` + config из авторизованного `/api/vpn/session/start` (`vpn.service.ts::buildStartResponse` уже отдаёт `config: server.configBlob`).
3. **Авто-отключение по серверному дедлайну** (§7.6, §14.2): приложение зовёт `stop()` по дедлайну, без частого heartbeat.

## AAR — сборка libbox (обязательно перед включением модуля)

`libbox.aar` НЕ публикуется в обычных релизах и НЕ лежит на Maven. Собрать самим
(так делают SFA/Hiddify), с **пиннингом версии**:

```bash
# нужен Android NDK + Go под go.mod sing-box, CGO_ENABLED=1
go install github.com/sagernet/gomobile/cmd/gomobile@latest   # ФОРК SagerNet, не upstream
go install github.com/sagernet/gomobile/cmd/gobind@latest
# из checkout sing-box на ПИННУТОМ теге (напр. v1.13.x):
gomobile bind -v -androidapi 21 -target=android \
  -tags "with_gvisor,with_quic,with_utls,with_clash_api,with_conntrack" \
  -trimpath -ldflags "-s -w" \
  -o ./libbox.aar ./experimental/libbox
```

- Положи `libbox.aar` в `modules/vpn/android/libs/`, подключи в `android/build.gradle` (`implementation(files("libs/libbox.aar"))`).
- **`with_gvisor` обязателен** — config использует `stack: "gvisor"` (по research: gvisor «просто работает» поверх fd VpnService; `system` требует более глубокой интеграции).
- **Версия AAR == версия генератора config'а.** Java-API libbox (геттеры `TunOptions`, `Libbox.setup`, набор методов `PlatformInterface`) И схема JSON движутся вместе с версией sing-box — это главный риск интеграции. Пере-пиннить осознанно, пересобирая обе стороны.

## Что осталось сделать (TODO)

1. **Вендорить `libbox.aar`** (см. §AAR) → `modules/vpn/android/libs/`, включить в `build.gradle`.
2. **Дореализовать `PlatformInterface`** в `VpnTunnelService.kt`: критичные методы готовы (`openTun`, `autoDetectInterfaceControl`, `usePlatformAutoDetectInterfaceControl=true`, `useProcFS/underNetworkExtension/includeAllNetworks=false`, `writeLog`). Остальные (`findConnectionOwner`, `getInterfaces`, `start/closeDefaultInterfaceMonitor`, `readWIFIState`, `systemCertificates`, `localDNSTransport`, `clearDNSCache`, `sendNotification`, …) — добить под **точный набор интерфейса вендоренного AAR** (скопировать дефолты из `PlatformInterfaceWrapper` SFA). Набор дрейфует с версией — сверять с AAR.
3. **JS-обвязка** (после первого prebuild с модулем) — держим вне typecheck-песочницы:
   ```ts
   // src/features/vpn/controller.ts (ПОСЛЕ первого prebuild с модулем)
   import { VpnModule } from '../../../modules/vpn';
   import type { VpnController } from './types';
   export const vpn: VpnController = VpnModule;
   ```
   Затем `useVpn()` поверх (подписка на `onStatusChange`, `prepare()` перед первым `start`).
4. **Кнопка «Подключиться»** на `HomeScreen` (сейчас `disabled`): `prepare()` → `/api/vpn/session/start` → `vpn.start({config, serverName})`; по серверному дедлайну → `vpn.stop()`.
5. **Split tunneling** (позже): уже поддержано в `openTun` через `include/exclude_package` из config'а (TunOptions); добавить генерацию этих полей из remote config на бэкенде.

## Тест на устройстве

- `prepare()` показывает системный VPN-consent; после согласия — ключик VPN в статус-баре.
- Коннект → трафик идёт через сервер (проверить внешний IP); фон не рвёт сессию.
- По истечении минут приложение само зовёт `stop()`, туннель закрывается.
- Отзыв consent (Настройки → VPN) → `onRevoke()` корректно гасит сессию.

## Замечания по безопасности (follow-up)

- `configBlob` и `host` сейчас хранятся в БД в открытом виде (колонки помечены «encrypted at rest, §9» — шифрование ещё не реализовано). Это техдолг: добавить at-rest шифрование перед продом.
- `parseSubscription` пока понимает только список URI (base64/plain). Если подписка отдаёт sing-box JSON или Clash YAML — вернётся 0 серверов (`SubscriptionError('empty')`). Добавить детект JSON/YAML при необходимости.
