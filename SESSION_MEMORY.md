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
