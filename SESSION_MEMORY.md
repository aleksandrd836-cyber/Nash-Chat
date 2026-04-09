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
