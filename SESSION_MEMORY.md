# Vibe Session Memory

## Формат
- Писать сюда только важные изменения и решения.
- Не дублировать весь код; хранить только смысл, причины и ссылки на файлы.

## 2026-04-09

### Что сделано
- Усилены invite-коды и регистрация.
- Добавлены 50 рабочих invite-кодов через SQL.
- ЛС-вложения переведены на private storage + signed URLs.
- Стабилизирована смена профиля / ника.
- Синхронизирована version metadata.
- Исправлен post-merge build issue в `useDirectMessages.js`.
- Начат реальный рефактор voice-ядра.

### По voice
- Добавлен `voice_sessions` и SQL hardening.
- Исправлялись ghost participants, stale reconnect target и stuck connecting UI.
- Вынесена часть voice-логики в `src/hooks/voice/*`.

### Что помнить
- Пользователь часто работает параллельно ещё и через Gemini / Antigravity.
- Поэтому все важные архитектурные решения нужно фиксировать текстом в md-файлах, а не держать только в памяти чата.

### Auto Log — 2026-04-09 22:21
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `.githooks/pre-commit`
  - `package.json`
  - `public/version.json`
  - `scripts/update-ai-memory.js`

### 2026-04-09 stream watch recovery
- Fixed a voice stream viewer bug in `src/components/VoiceChannel.jsx`.
- Root cause: watcher-side `watchedScreens` could remain true after the remote video stream disappeared.
- Result: the stream window vanished and the watch button did not come back.
- Fix: stale watched entries are cleaned up, the button can reappear when the stream is missing, and the viewer auto-requests the stream again with a short cooldown while the participant is still marked as sharing.
- Validation: `npm run build` passed after the change.

### Auto Log — 2026-04-09 23:55
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/VoiceChannel.jsx`

### 2026-04-10 voice screen-share refactor
- Extracted screen-share quality profiles, media constraints, sender bitrate setup, and peer attach/detach logic into src/hooks/voice/screenShare.js.
- Updated src/hooks/useVoice.js to import the new helpers and keep the screen-share lifecycle thinner inside the main hook.
- Restored the ping state/effect after the refactor so VoiceChannel keeps receiving latency updates.
- Verified with 
pm run build (passes on version 2.5.12).
- Follow-up target: continue splitting useVoice.js into reconnect/session sync vs WebRTC peer lifecycle.

### 2026-04-10 remote media track extraction
- Added src/hooks/voice/mediaTracks.js for remote video stream attach/cleanup and remote audio element/gain/analyser setup.
- Replaced the inline pc.ontrack media handling inside src/hooks/useVoice.js with helper calls.
- useVoice.js now keeps less DOM/audio wiring inline and is easier to reason about during WebRTC regressions.
- Re-ran 
pm run build after the extraction; build stays green on 2.5.12.

### Auto Log — 2026-04-10 00:20
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/mediaTracks.js`
  - `src/hooks/voice/screenShare.js`

### 2026-04-10 peer lifecycle extraction
- Added src/hooks/voice/peerLifecycle.js for existing-track attach, negotiation-needed handler, ICE candidate send handler, and ICE connection state recovery handler.
- Simplified createPeerConnection(...) inside src/hooks/useVoice.js so it mostly wires callbacks together instead of owning every branch inline.
- Verified with 
pm run build; build is green and synced version moved to 2.5.13.
- Remaining high-value slice: separate signaling/reconnect orchestration from the main hook.

### Auto Log — 2026-04-10 00:25
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/peerLifecycle.js`

### 2026-04-10 reconnect runtime helper extraction
- Added src/hooks/voice/runtime.js for managed timeout/interval helpers (clearManagedTimeout, clearManagedInterval, clearManagedTimeoutMap, estartManagedInterval, scheduleManagedTimeout).
- Updated src/hooks/useVoice.js cleanup and reconnect-related code to use the shared runtime helpers instead of open-coded timer cleanup.
- This reduces repeated timer logic in cleanupAll, heartbeat setup, presence debounce, and reconnect cancellation paths.
- Verified with 
pm run build; build stays green on 2.5.14.

### Auto Log — 2026-04-10 00:32
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/runtime.js`

### 2026-04-10 signaling helper extraction
- Added src/hooks/voice/signaling.js for voice-channel broadcast handlers: offer, answer, ICE, user-left, and request-stream.
- Replaced the large inline signaling handler block inside src/hooks/useVoice.js with helper factories.
- joinVoiceChannel(...) still owns the channel subscription status flow, but the per-event signaling logic is no longer embedded there.
- Verified with 
pm run build; build is green on 2.5.15.

### Auto Log — 2026-04-10 00:35
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/signaling.js`

### 2026-04-10 local channel status extraction
- Added src/hooks/voice/channelStatus.js for local voice channel subscribe-status handling (SUBSCRIBED, CLOSED, CHANNEL_ERROR) and reconnect scheduling.
- Replaced the large inline channel.subscribe(async (status) => ...) block in src/hooks/useVoice.js with createLocalVoiceChannelStatusHandler(...).
- joinVoiceChannel(...) now delegates per-event signaling and per-status channel transitions to helper modules, leaving mainly top-level orchestration in the hook.
- Verified with 
pm run build; build is green on 2.5.16.

### Auto Log — 2026-04-10 00:40
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/channelStatus.js`

### 2026-04-10 global presence and media bootstrap extraction
- Added src/hooks/voice/globalPresence.js for global voice presence participant sync, presence leave cleanup, and global channel status recovery handling.
- Added src/hooks/voice/mediaInit.js for local microphone/audio-context/noise-suppression/VAD bootstrap.
- Updated src/hooks/useVoice.js to delegate both the global presence effect internals and the heavy local media initialization path.
- src/hooks/useVoice.js length is now down to ~891 lines in this checkpoint, versus a much larger monolith before the staged refactor.
- Verified with 
pm run build; build is green on 2.5.17.

### Auto Log — 2026-04-10 00:47
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/globalPresence.js`
  - `src/hooks/voice/mediaInit.js`
### 2026-04-10 voice orchestration extraction finish
- ????????? ??????? ???????? src/hooks/useVoice.js.
- ???????? ????????? ??????? ????? orchestration-??????:
  - src/hooks/voice/sessionSync.js ? ????????????? ????????? voice-presence ?????????? ? ghost-peer cleanup.
  - src/hooks/voice/cleanup.js ? ?????? cleanup voice-??????, ???????, media ? presence.
  - src/hooks/voice/localChannelBootstrap.js ? ???????? ?????????? Realtime voice-??????, broadcast handlers ? subscribe/status wiring.
- src/hooks/useVoice.js ??? ??????? ???? coordinator-layer ? ?????????? ???????? ?? 724 ?????.
- ?????? 
pm run build ????? ????? ??????? ???????.

### Auto Log — 2026-04-10 09:46
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/cleanup.js`
  - `src/hooks/voice/localChannelBootstrap.js`
  - `src/hooks/voice/sessionSync.js`
### 2026-04-10 bundle optimization pass
- ????????????? ????????? bundle ?????????.
- ? src/App.jsx route-level ?????? ?????????? ?? lazy loading ????? React.lazy + Suspense:
  - TextChannel
  - VoiceChannel
  - DirectMessagePanel
  - MembersPanel
  - Hub
- ???????? PanelLoadingFallback ??? ??????????? ??????? ??????????.
- ? ite.config.js ???????? manualChunks, ????? ????????? vendor-??? ?? ui-vendor, emoji-vendor, supabase-vendor, oice-vendor, endor.
- ????? ?????? ???????? index-chunk ???????? ???????? ? ~563 kB ?? ~93 kB; ??????? ??????????? ???????? ? ????????? ?????.

### Auto Log — 2026-04-10 14:06
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`
  - `vite.config.js`
