# AI Handoff Notes

Этот файл нужен, чтобы разные ИИ-сессии и разные чаты быстрее подхватывали проект без потери контекста.

## Как использовать
- Перед началом крупной правки сначала читать:
  - `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\AI_CONTEXT_INDEX.md`
  - `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\ARCHITECTURE_STATE.md`
  - `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\VOICE_SYSTEM_STATE.md`
  - `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\SESSION_MEMORY.md`

## Мини-правила
- Не считать, что старый `useVoice.js` безопасно менять без smoke-test.
- Не возвращать DM-вложения к public URL.
- Не ломать registration flow с invite reservation.
- После крупных изменений обновлять эти md-файлы.

## Для другого ИИ
- Если ты новая сессия и нужно быстро войти в проект:
  - начни с voice-системы, если задача касается звонков;
  - начни с `useAuth.js` и SQL-файлов, если задача касается регистрации;
  - начни с `useDirectMessages.js` и `Message.jsx`, если задача касается ЛС и вложений.

## Для автоматизации
- Эти файлы можно использовать как стабильную "общую память" между:
  - разными чатами Codex,
  - Gemini / Antigravity,
  - любым другим ИИ, который видит проект как файловую систему.

<!-- AUTO-LAST-UPDATE:START -->
## Last Auto Update
- Время: `2026-04-10 00:35`
- Последние staged-файлы перед коммитом:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/signaling.js`
<!-- AUTO-LAST-UPDATE:END -->

## Manual note 2026-04-09
- Screen-share watch flow was patched in `src/components/VoiceChannel.jsx`.
- If someone reports "stream disappeared and the watch button is gone", inspect watcher-side `watchedScreens` and `remoteScreens` first.

## 2026-04-10 handoff note
- Finished the next voice refactor slice: screen-share helpers now live in src/hooks/voice/screenShare.js and are wired into src/hooks/useVoice.js.
- Build is green after the refactor (
pm run build).
- Watch next for regressions around Electron/browser parity during stream start/stop and reconnect after stream loss.

## 2026-04-10 additional handoff note
- After the screen-share helper extraction, the next slice is also done: remote media track handling is now in src/hooks/voice/mediaTracks.js.
- useVoice.js still needs further decomposition, but two dense areas are already out: screen-share peer wiring and remote media attach logic.
- Latest verification: 
pm run build passes.

## 2026-04-10 peer lifecycle handoff
- Finished another useVoice.js split: peer lifecycle helper module added at src/hooks/voice/peerLifecycle.js.
- Latest safe checkpoint: build passes after screen-share, remote media, and peer lifecycle extractions.
- Best next refactor target is the join/reconnect/signaling orchestration around Realtime channels and background reconnect timers.

## 2026-04-10 runtime helper handoff
- Added src/hooks/voice/runtime.js and wired it into useVoice.js.
- Voice refactor status now includes extracted modules for: participants, screen share, remote media tracks, peer lifecycle callbacks, and runtime timer management.
- Next logical target is the actual join/reconnect signaling flow around Realtime channels.

## 2026-04-10 signaling handoff
- Latest refactor slice completed: signaling event handlers moved to src/hooks/voice/signaling.js.
- Current useVoice.js still needs one more serious pass over channel status transitions and reconnect flow, but the file is materially less monolithic now.
- Build passes after this extraction.
