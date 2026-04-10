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
- Время: `2026-04-11 02:56`
- Последние staged-файлы перед коммитом:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`
  - `src/index.css`
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

## 2026-04-10 local channel status handoff
- Added src/hooks/voice/channelStatus.js and wired useVoice.js to use it for local channel subscribe status handling.
- The file is now substantially less monolithic; the main unresolved heavy zone is the join bootstrap + global presence lifecycle rather than per-peer or per-status callback bodies.
- Build passes after this extraction.

## 2026-04-10 major refactor checkpoint
- The main useVoice.js decomposition pass is effectively complete for now.
- Extracted modules now include: participants.js, screenShare.js, mediaTracks.js, peerLifecycle.js, untime.js, signaling.js, channelStatus.js, and globalPresence.js, plus mediaInit.js for local media startup.
- Current guidance for future work: prefer testing and targeted bug-fixing before any more structural refactors.

## 2026-04-10 final voice refactor checkpoint
- ??????? ??????? src/hooks/useVoice.js ??????? ?? coordinator-???????.
- ????? helper modules ????? ???????: src/hooks/voice/sessionSync.js, src/hooks/voice/cleanup.js, src/hooks/voice/localChannelBootstrap.js.
- ????? ????????? npm run build ????????.
- ????????? ?????? ?? ????? ?????????? ?????? ???????? useVoice.js; ????? ?????????? ? ????? voice/browser/exe ????????? ? ?????? ?????? ??????????????? ?????.


## 2026-04-10 bundle optimization checkpoint
- App route-level panels are now lazy-loaded in src/App.jsx.
- Added Suspense fallback for the central panel area.
- Vite manualChunks now split vendor code into ui-vendor, emoji-vendor, supabase-vendor, voice-vendor, and vendor.
- Main startup bundle is much smaller; future work should be targeted only if real loading issues remain.


## 2026-04-10 emoji loading checkpoint
- emoji-picker-react is now loaded on demand via src/components/LazyEmojiPicker.jsx.
- TextChannel, DirectMessagePanel, and Message no longer import the picker directly in the normal render path.
- Message rendering and reaction badges now use lightweight native emoji glyph spans instead of the picker package.
- Build passes; emoji vendor remains a separate chunk and should load only when the picker is opened.


## 2026-04-10 lazy route crash handoff
- Fixed the post-login production crash introduced by route-level lazy loading.
- `src/App.jsx` now restores proper `Suspense` boundaries for lazy main panels and `MembersPanel`.
- Added `startTransition` around navigation and lazy modal open actions to reduce React 18 synchronous-suspense risk.
- Next step after this fix: verify app startup, channel switching, DM open/close, and settings/server modal open in both browser and exe builds.

## 2026-04-10 voice UI perf handoff
- Completed the first focused rerender pass for the post-refactor voice UI.
- `VoiceChannel.jsx` now memoizes core derived state and avoids repeated participant scans inside effects.
- `Sidebar.jsx` now memoizes flattened voice participants, split channel lists, and context-menu derived values.
- This was intentionally kept logic-safe: no signaling or session behavior changed, only render-time derivations and listener setup were tightened.
- Good next step after this checkpoint: verify whether `ChannelItem` / `VoiceParticipant` still rerender too often from inline handlers, but only if real UI jank remains.

## 2026-04-10 DM runtime handoff
- Fixed `ReferenceError: isPlatformCreator is not defined` in `src/components/Message.jsx`.
- The crash reproduced when opening direct messages because the Message component hit the missing helper during author badge rendering.
- The fix is intentionally minimal and logic-safe: restore the helper at module scope using the same creator IDs used elsewhere in voice UI.

## 2026-04-10 DM emoji regex handoff
- Fixed `ReferenceError: EMOJI_REGEX is not defined` in `src/components/Message.jsx`.
- This was the follow-up runtime bug after the previous creator-badge fix: the message renderer still depended on a removed emoji regex constant.
- The fix restores the regex at module scope so DM/text message rendering can safely split and render emoji inline again.

## 2026-04-10 Message hardening handoff
- After the DM `isPlatformCreator` and `EMOJI_REGEX` fixes, a final focused hardening pass was applied to `src/components/Message.jsx`.
- Main goal: remove obvious remaining runtime fragility in copy/edit/theme-dependent code paths without changing the overall message UX.
- The file is now in a safer state for DM and text-channel rendering, but future work should prefer adding tests rather than more blind refactors.

## 2026-04-10 message read-status handoff
- Fixed broken read-status display in messages by replacing text glyphs with icon components.
- This is a robustness fix, not a logic change: message read state still uses the same `is_read` flag.

## 2026-04-10 expiry UI and auto-cleanup handoff
- Fixed two message UI issues: corrupted 14-day deletion tooltip text and oversized emoji-only message rendering.
- Important infra finding: auto-delete was implemented, but not fully wired into fresh database setup because `full-setup.sql` lacked the cron section from `ephemeral_messages.sql`.
- `ephemeral_messages.sql` is now idempotent, and `full-setup.sql` now provisions the same hourly cleanup jobs for `messages` and `direct_messages`.
- Live cron execution on the current production database still cannot be proven from anon-key access alone, but the repository setup is now internally consistent.

## 2026-04-11 visual system handoff
- Began the design work in the correct order: first unify the visual system, then redesign individual screens.
- `src/index.css` now contains the new shared shell language: calmer layered backgrounds, stronger semantic surface tokens, reusable panel/rail/button/icon-tile helpers, and better light-theme depth.
- `tailwind.config.js` now correctly maps `ds-accent` to the live CSS variable and adds a `ds-border` alias for divider/border usage.
- First adoption pass is already applied to the global shell and navigation-heavy components (`App`, `ServerSidebar`, `Sidebar`, `ProfileFooter`, `UserPanel`, `Hub`).
- This is intentionally a foundation pass, not a full redesign yet. Next logical design step is to restyle the hub/home screen on top of these shared tokens instead of inventing one-off styles.
- Build status after the foundation pass: `npm run build` succeeds on `2.5.28`.

## 2026-04-11 optical centering handoff
- Follow-up fix after the visual foundation pass: several centered scenes felt pushed upward.
- This was addressed as a global composition issue rather than reverting the new design tokens.
- Main adjustments:
  - lowered the floating DM action button in `src/App.jsx`
  - added better bottom compensation to the empty server state in `src/App.jsx`
  - rebalanced hub spacing in `src/components/Hub.jsx`
  - re-centered the voice stage in `src/components/VoiceChannel.jsx`
- Build status after the centering correction: `npm run build` succeeds on `2.5.29`.

## 2026-04-11 shell height bug handoff
- Previous diagnosis was too narrow: the main issue was a bottom empty strip caused by shell sizing, not only visual centering.
- Fixed by changing the top-level app shell in `src/App.jsx` from `fixed inset-0` to explicit viewport sizing and by reinforcing root min-height rules in `src/index.css`.
- If the blank strip still appears after this version, the next debugging step should inspect Electron window sizing or any external wrapper constraints, not the inner screen layouts.
- Build status after the shell-height correction: `npm run build` succeeds on `2.5.30`.
