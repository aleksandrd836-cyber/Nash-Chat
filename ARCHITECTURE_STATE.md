# Vibe Architecture State

## Текущее состояние
- Платформа: `Vite + React` для web, `Electron` для desktop.
- State management: `Zustand`.
- Backend: `Supabase` для auth, БД, realtime, storage.
- Voice: `WebRTC + Supabase Realtime Presence + server-backed voice_sessions`.

## Ключевые файлы
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\App.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\store\useStore.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useAuth.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useDirectMessages.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useVoice.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\lib\supabase.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\electron\main.cjs`

## Что уже усилено
- Invite-коды: flow с резервированием / освобождением / финализацией.
- DM attachments: новые вложения в ЛС через private storage + signed URLs.
- Профиль: обновление ника и цвета через единый серверный путь.
- Version metadata: `public/version.json` синхронизируется из `package.json`.

## SQL-файлы, которые уже важны
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\invite-code-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\dm-private-attachments.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\profile-update-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\voice-sessions-hardening.sql`

## Текущие риски
- Главный технический долг — слишком большой `useVoice.js`.
- Voice-логика всё ещё проходит постепенную декомпозицию.
- Большой фронтенд-бандл (`vite` предупреждает о размере chunk).

## Рекомендация для будущих сессий
- Любые изменения в voice сначала сверять с `VOICE_SYSTEM_STATE.md`.
- Не возвращать логику к клиентскому хаотичному presence-only подходу.
