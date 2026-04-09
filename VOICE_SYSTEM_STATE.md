# Vibe Voice System State

## Статус
- Voice-система рабочая, но исторически была очень хрупкой.
- Сейчас она частично переведена с хаотичного presence-only подхода на более каноническую схему.

## Главный файл
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useVoice.js`

## Новые вспомогательные voice-модули
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\voice\constants.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\voice\utils.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\voice\participants.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\lib\voiceSessions.js`

## Что уже внедрено
- `voice_sessions` как серверный источник истины для активных голосовых сессий.
- Cleanup stale sessions через SQL-функцию.
- Сессии теперь завязаны на `sessionId`, а не только на `userId`.
- Исправлялись:
  - зависание "призраков";
  - прыжок обратно в старый канал после reconnect;
  - вечное состояние `Подключение...`;
  - конфликты между global presence и local voice channel.

## Что недавно вынесено
- Обновление карты участников, удаление сессий, stale pruning и speaking-state вынесены в `participants.js`.
- Utility-функции для session-aware удаления и сравнения realtime topic вынесены в `utils.js`.

## Что важно не ломать
- `sessionId` — обязательный идентификатор voice-сессии.
- `lastStableChannelIdRef` нужен для корректного reconnect.
- `voice_sessions` не должен быть тихо удалён из потока — на нём держится стабильность UI.
- Нельзя снова смешивать несколько конкурирующих источников истины без явной иерархии.

## Следующий правильный шаг
- Дальше делить `useVoice.js` на:
  - `voice presence/session sync`
  - `reconnect machine`
  - `webrtc peer lifecycle`
  - `screen share/device controls`

## Быстрый smoke-test voice после правок
- 2 клиента / 2 аккаунта.
- Вход в один голосовой канал.
- Выход одного клиента.
- Быстрое переключение между двумя каналами.
- Переподключение после `Realtime CLOSED`.
- Проверка, что иконка не залипает в старом канале.

## Recent stream fix
- Viewer-side stream recovery logic was strengthened in `src/components/VoiceChannel.jsx`.
- If a remote stream disappears but the participant is still marked as screen sharing, the UI can now request it again instead of getting stuck in a hidden watched state.

## 2026-04-10 screen-share extraction
- src/hooks/voice/screenShare.js is now the canonical place for stream quality profiles and screen track attach/detach helpers.
- useVoice.js still owns the public API (startScreenShare / stopScreenShare), but the low-level peer sender work moved out.
- ping polling remains in useVoice.js and was restored after extraction.
- Next refactor slice: isolate peer negotiation/reconnect state from UI-facing session state.

## 2026-04-10 remote media helper extraction
- src/hooks/voice/mediaTracks.js now owns remote screen stream attach/cleanup and remote audio analyser/gain wiring.
- createPeerConnection(...).ontrack in src/hooks/useVoice.js was reduced to routing by 	rack.kind.
- This reduces one more dense branch inside useVoice.js; next good target remains peer negotiation/reconnect state.

## 2026-04-10 peer lifecycle helper extraction
- src/hooks/voice/peerLifecycle.js now contains the negotiation-needed, ICE candidate, ICE state recovery, and initial-track attach helpers.
- useVoice.js keeps the top-level createPeerConnection(...) API, but most peer callback bodies are no longer inline.
- Refactor status by subsystem now:
  - extracted: participants, screen-share helpers, remote media tracks, peer lifecycle callbacks
  - still dense: signaling channel orchestration, join/leave flow, reconnect/session sync

## 2026-04-10 runtime timer helper extraction
- src/hooks/voice/runtime.js now owns managed timeout/interval cleanup helpers for the voice subsystem.
- useVoice.js now uses the shared runtime helpers for reconnect timer cleanup, ghost-peer timer cleanup, heartbeat loop restart, and fatal reconnect cancellation.
- The remaining dense slice is the Supabase signaling/join/reconnect orchestration itself rather than the raw timer plumbing.

## 2026-04-10 signaling helper extraction
- src/hooks/voice/signaling.js now owns the voice broadcast event handlers for offer/answer/ICE/user-left/request-stream.
- useVoice.js still contains the higher-level join/subscription status orchestration, but the channel event payload handling is now factored out.
- Remaining dense area is mainly the channel status / reconnect orchestration inside joinVoiceChannel(...) plus some global presence setup.

## 2026-04-10 local channel status helper extraction
- src/hooks/voice/channelStatus.js now owns the local voice channel status transitions and reconnect scheduling for the per-channel Realtime subscription.
- Extracted modules now cover: participants, screen share, remote media tracks, peer lifecycle, runtime timer management, signaling handlers, and local channel status handling.
- Remaining dense areas are mostly global presence bootstrap/heartbeat and the broader join-flow orchestration around media init + Realtime setup.

## 2026-04-10 final major useVoice decomposition pass
- src/hooks/voice/globalPresence.js now owns global presence participant rebuilding, presence leave removal, and global channel recovery status logic.
- src/hooks/voice/mediaInit.js now owns local media bootstrap: mic acquisition, AI noise suppression setup, audio context wiring, and VAD loop startup.
- After this pass, useVoice.js mainly acts as the coordination layer that wires helpers together instead of containing every subsystem inline.
- Remaining work in the future is optional polish/refinement, not another giant monolith split.
