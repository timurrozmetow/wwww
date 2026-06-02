# VPN.md — нативный VPN-модуль (Kotlin + sing-box)

> Архитектура и шаги доведения нативного VPN до рабочего состояния (Этап B).
> Скелет лежит в `apps/mobile/modules/vpn/` (Expo local module). Kotlin здесь не
> компилируется (нет Android SDK) — собирается на устройстве через `prebuild`.

## Архитектура (CLAUDE.md §3)

```
JS (app)                 modules/vpn (Expo local module)            Android OS
────────                 ──────────────────────────────            ──────────
useVpn() ─ start(cfg) ─▶ VpnModule.kt (bridge) ─ startService ─▶ VpnTunnelService
   ▲                         │  onStatusChange ◀── statusListener     │ (VpnService)
   │                         ▼                                        ▼ establish() TUN
status events           Expo Modules API                        sing-box (libbox.aar)
```

- **VpnModule.kt** — тонкий мост JS↔натив: `prepare/start/stop/getStatus` + событие `onStatusChange`. Денежной логики и сырого конфига здесь нет.
- **VpnTunnelService.kt** — `android.net.VpnService` как **foreground service**: строит TUN, отдаёт его sing-box, держит соединение живым в фоне (§7.6), корректно завершается по `stop()` / `onRevoke()`.
- **AndroidManifest.xml** (в модуле) — добавляет сервис с `BIND_VPN_SERVICE`, `foregroundServiceType="specialUse"` и нужные permission'ы; мерджится в манифест приложения при `prebuild`.

## Инварианты (НЕ нарушать)

1. **Сырой sing-box config НЕ виден пользователю и не логируется** (§7.2). Он приходит с бэкенда, прокидывается в нативный слой как opaque-строка и уходит прямо в core. В UI — только `VpnServerView` (страна/флаг/имя/ping).
2. **Старт сессии — только после проверки баланса на бэкенде** (§7.8). JS получает short-lived `sessionToken` + config из авторизованного `/api/vpn/session/start`.
3. **Авто-отключение по серверному дедлайну** (§7.6, §14.2): бэкенд знает момент исчерпания минут; приложение зовёт `stop()` по дедлайну, не полагаясь на частый heartbeat.

## Что осталось сделать (TODO)

1. **Добавить sing-box `libbox.aar`** (gomobile-сборка sing-box) в `modules/vpn/android/libs/` и раскомментить зависимость в `android/build.gradle`. Источник: релизы sing-box (mobile/libbox) или собрать `gomobile bind`.
2. **Подключить libbox** в `VpnTunnelService.kt` на отмеченных точках:
   - `startTunnel`: `SingBoxBridge.start(config, tun.fd, sessionToken)` (после `builder.establish()`);
   - `stopTunnel`: `SingBoxBridge.stop()`;
   - `statusMap`: реальные `bytesIn/bytesOut` из `SingBoxBridge.stats()`.
3. **Доставка config'а**: расширить `/api/vpn/session/start`, чтобы он (для нативного слоя, не для UI) отдавал sing-box config выбранного сервера. Сейчас бэкенд отдаёт безопасный `VpnServerView` + токен; добавить серверный endpoint, возвращающий зашифрованный/short-lived config именно процессу приложения.
4. **JS-обвязка** (после первой нативной сборки) — 5 строк, держим вне typecheck песочницы (модуль линкуется только в dev/preview build):
   ```ts
   // src/features/vpn/controller.ts (добавить ПОСЛЕ первого prebuild с модулем)
   import { VpnModule } from '../../../modules/vpn';
   import type { VpnController } from './types';
   export const vpn: VpnController = VpnModule;
   ```
   Затем `useVpn()` поверх него (подписка на `onStatusChange`, `prepare()` перед первым `start`).
5. **Включить кнопку «Подключиться»** на `HomeScreen` (сейчас `disabled`): `prepare()` → `/api/vpn/session/start` → `vpn.start({config, sessionToken, serverName})`; по серверному дедлайну → `vpn.stop()`.
6. **Split tunneling** (позже): `addDisallowedApplication(...)` по списку из remote config.

## Тест на устройстве

- `prepare()` показывает системный VPN-consent; после согласия — ключик VPN в статус-баре.
- Коннект → трафик идёт через сервер (проверить внешний IP); фон не рвёт сессию.
- По истечении минут приложение само зовёт `stop()`, туннель закрывается.
- Отзыв consent (Настройки → VPN) → `onRevoke()` корректно гасит сессию.
