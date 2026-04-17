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
- Время: `2026-04-17 16:20`
- Последние staged-файлы перед коммитом:
  - `package.json`
  - `public/version.json`
  - `src/hooks/useVoice.js`
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
- Extracted modules now include: participants.js, screenShare.js, mediaTracks.js, peerLifecycle.js, 
untime.js, signaling.js, channelStatus.js, and globalPresence.js, plus mediaInit.js for local media startup.
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

## 2026-04-11 accent/theme handoff
- Solved the dark-button regression at the root by changing Tailwind semantic color definitions from `rgb(var(--token) / alpha)` to `rgba(var(--token), alpha)`.
- This matters because the project stores RGB tokens with commas, so the previous form could generate invalid CSS for accent backgrounds and text colors.
- First theme pass is now in place: better light-theme contrast, stronger light-mode rails/panels, and more reliable CTA visibility.
- Shared `vibe-primary-button` is now used in the most visible CTA paths in `TextChannel` and `VoiceChannel`.
- Build status after the accent/theme fix: `npm run build` succeeds on `2.5.31`.

## 2026-04-11 DM badge/FAB/theme handoff
- Fixed corrupted creator/admin badge text in `Message.jsx` for direct messages.
- Updated the global DM floating action button positioning logic in `App.jsx`: it now sits higher on screens with a bottom message composer so it no longer blocks send controls.
- Continued theme step 2 by converting more chat/voice headers and composer surfaces to shared panel utilities in `DirectMessagePanel`, `TextChannel`, and `VoiceChannel`.
- Result: better consistency between dark/light themes and fewer one-off transparent boxes.
- Build status after this pass: `npm run build` succeeds on `2.5.32`.

## 2026-04-11 side-theme handoff
- Theme polishing now includes the remaining major side surfaces, not just central chat panels.
- `MembersPanel`, `ChannelItem`, `VoiceParticipant`, and `ServerEntryModal` were updated to use the shared rail/panel/CTA language.
- This pass also quietly fixed one correctness issue in the members list: owner highlighting now actually receives `ownerId` in row rendering.
- Creator badge labels in side lists are normalized to clean Russian text.
- Build status after this continuation pass: `npm run build` succeeds on `2.5.33`.

## 2026-04-11 channel permissions handoff
- If channel create / rename / delete suddenly fails with Supabase code `42501`, inspect `channel-rls-hardening.sql` first.
- That SQL adds missing write policies on `public.channels` so only the server owner can manage channels.
- Repo mirror of the same logic was added to `full-setup.sql`.
- UI-side clarification also lives in `src/components/Sidebar.jsx`, where raw Supabase permission errors are converted into a human message.

## 2026-04-11 auth-theme handoff
- Shared theme primitives were extended in `src/index.css` with `vibe-secondary-button` and `vibe-form-field`, while `vibe-primary-button` got stronger contrast and hover presence.
- `src/components/AuthPage.jsx` now consumes those shared primitives, so auth fields and CTA match the newer shell/hub/voice styling more closely in both themes.

## 2026-04-11 settings-theme handoff
- Theme step 2 now includes the settings stack, not only the main shell and channel panels.
- Inspect `src/components/SettingsModal.jsx`, `src/components/ServerSettingsModal.jsx`, and `src/components/HotkeysSettings.jsx` first if someone reports theme inconsistency between dark and light modes.
- Shared UI primitives used in this pass live in `src/index.css`: `vibe-primary-button`, `vibe-secondary-button`, and `vibe-form-field`.
- Latest safe checkpoint after this continuation: `npm run build` passes on `2.5.35`.

## 2026-04-11 server invite handoff
- If server creation fails with RLS on `servers`, or server join codes return `not_found`, inspect `server-rls-hardening.sql` first.
- This pass adds missing write policies for `servers` and `server_members`, and also normalizes invite-code lookup inside `join_server_by_invite`.
- Client-side normalization for server join codes now lives in `src/components/ServerEntryModal.jsx`.
- Server invite-code selection/copy UX now lives in `src/components/ServerSettingsModal.jsx`.
- If Supabase throws `42P13 cannot change return type of existing function`, re-run the updated SQL that starts with `DROP FUNCTION IF EXISTS public.join_server_by_invite(TEXT);`.
- The minimal recovery path is to drop and recreate only `public.join_server_by_invite(TEXT)` plus `GRANT EXECUTE`, without re-running the entire script.

## 2026-04-11 server modal encoding handoff
- If server create/join modal or server settings suddenly show mojibake, inspect `src/components/ServerEntryModal.jsx` and `src/components/ServerSettingsModal.jsx` first.
- Both files were rewritten cleanly in UTF-8 after text corruption slipped into the repo during prior edits.
- Invite-code copy now has three layers: `navigator.clipboard`, hidden textarea + `document.execCommand('copy')`, and final manual prompt fallback.
- Latest safe checkpoint after this fix: `npm run build` passes on `2.5.37`.

## 2026-04-11 invite selection hotfix
- The invite-code field in server settings could not be selected because the main app shell uses `select-none`, and the invite card also had a decorative glow layer intercepting interactions.
- `src/components/ServerSettingsModal.jsx` now marks the glow as `pointer-events-none`, raises the interactive content above it with `z-10`, and forces text selection on the invite input with inline `user-select: text`.
- `src/components/ServerEntryModal.jsx` and `src/components/ServerSettingsModal.jsx` now store all visible Russian strings as `\uXXXX` literals, which avoids future mojibake even if terminal/file encoding gets weird.
- Latest safe checkpoint after this fix: `npm run build` passes on `2.5.38`.

## 2026-04-11 server deletion handoff
- If a server refuses to delete from the settings modal, inspect `server-delete-hardening.sql` first.
- The old UI path called `supabase.from('servers').delete()` directly and gave almost no signal when hidden DB dependencies blocked deletion.
- New flow uses RPC `delete_owned_server(UUID)` that checks ownership and then explicitly clears dependent records: `channel_last_read`, `message_reactions`, `messages`, `channels`, `server_members`, and the `servers` row.
- Frontend call site is `src/components/ServerSettingsModal.jsx`; it now surfaces Supabase errors through an alert instead of silently closing.
- Latest safe checkpoint after this fix: `npm run build` passes on `2.5.39`.

## 2026-04-11 server actions RPC handoff
- If server actions feel flaky, inspect `server-management-hardening.sql` together with `server-delete-hardening.sql`.
- The frontend no longer relies on raw inserts/updates/deletes for the main server-owner flows.
- Current RPC map:
  - `create_owned_server(TEXT)` for server creation
  - `update_owned_server(UUID, TEXT, TEXT)` for rename/icon update
  - `regenerate_server_invite_code(UUID)` for invite refresh
  - `remove_server_member(UUID, UUID)` for kicks
  - `delete_owned_server(UUID)` for full deletion
- Main client call sites:
  - `src/components/ServerEntryModal.jsx`
  - `src/components/ServerSettingsModal.jsx`
- Latest safe checkpoint after this pass: `npm run build` passes on `2.5.40`.

## 2026-04-11 message-stream-realtime handoff
- `src/components/Message.jsx` had user-visible mojibake only during optimistic send; the root cause was stale broken literals for the pending/edit/context labels. This pass centralizes those labels in a local `TEXT` map and uses clean UTF-8 values.
- Screen share instability was addressed in three places:
  - `src/hooks/voice/screenShare.js` now captures with safer constraints and applies quality after capture via `MediaStreamTrack.applyConstraints(...)`.
  - `src/hooks/voice/screenShare.js` and `src/hooks/voice/signaling.js` now explicitly trigger renegotiation after adding/removing screen tracks.
  - `src/hooks/useVoice.js` now updates `isScreenSharing` presence immediately on start/stop, which should reduce cases where viewers never see the stream state.
- Live server sync now flows through `src/components/ServerSidebar.jsx` and `src/App.jsx`:
  - subscribe to `servers` changes as well as `server_members`
  - refresh the selected server object when its avatar/name/invite changes
  - if the current user loses membership, clear selected server/channel and leave voice immediately
- Latest safe checkpoint after this pass: `npm run build` passes on `2.5.41`.

## 2026-04-11 stream-reconnect-state handoff
- Fixed a regression where active screen sharing disappeared for viewers after ~15 seconds even though the streamer still saw it locally.
- Root cause: src/hooks/useVoice.js rebuilt presencePayload.current with isScreenSharing: false during silent voice-channel reconnects; subsequent oice_sessions upserts overwrote the server state and the viewer UI hid the watch button.
- Added getLocalScreenSharingState() and made both updatePresenceStatus() and the join/reconnect payload derive isScreenSharing from the live screen track when no explicit override is provided.
- Build verified successfully with 
pm run build (2.5.42).

## 2026-04-15 creator-voice-override handoff
- Added a fast remote voice-state override for platform creators in voice channels.
- src/hooks/useVoice.js now exposes orceParticipantVoiceState(targetUserId, state) and applies incoming dmin-voice-state broadcasts for creator-issued unmute/undeafen actions.
- src/hooks/voice/localChannelBootstrap.js subscribes to the new dmin-voice-state broadcast event.
- src/components/VoiceChannel.jsx shows ����� ��� and �������� ���� actions in the participant context menu only for creator accounts.
- Build verified with 
pm run build (2.5.44).

## 2026-04-15 voice-reconnect-ui-fallback handoff
- Fixed the case where users still heard each other but avatars/participants disappeared after Supabase realtime/voice_sessions failures, which also killed stream watch/retry UX.
- src/hooks/useVoice.js now preserves the last known participant map, falls back away from oice_sessions on runtime connectivity failures, and merges active peer/audio/video connections back into the visible participant list for the active channel.
- Added pendingStreamRequestsRef so stream retry requests made during signaling outages are replayed automatically once the voice channel re-subscribes.
- src/hooks/voice/channelStatus.js now flushes pending stream requests on SUBSCRIBED; wiring added in src/hooks/voice/localChannelBootstrap.js.
- Build verified successfully with 
pm run build (2.5.45).

## 2026-04-15 voice-presence-resilience handoff
- Deepened the long-standing fix for the case where WebRTC audio stays alive but participant avatars disappear after Supabase presence/realtime instability.
- `src/hooks/useVoice.js` now keeps a participant snapshot registry (`participantSnapshotsRef`) so active peers can be restored from the last good metadata even after `voice_sessions` or presence drops a user from the map.
- The active-channel fallback now promotes live peer/audio/video state back into the rendered participant list instead of trusting only the latest server response.
- Remote screen streams are no longer deleted just because a temporary participant sync says `isScreenSharing=false`; they are kept while the incoming video track is still live.
- `src/hooks/voice/globalPresence.js` now always attempts to recover the global presence channel after `CLOSED` / `CHANNEL_ERROR`, even when the server-backed session map was still healthy at the moment of failure.
- `src/components/VoiceChannel.jsx` now keeps watched streams pinned while either the participant still advertises screen share or the remote video track is still live.
- Build verified successfully with `npm run build` (`2.5.46`).

## 2026-04-15 stream-render-detached-from-participants handoff
- Added one more stream-safety layer: active screen playback no longer depends strictly on the current `participants` array.
- `src/hooks/useVoice.js` now exposes `getParticipantSnapshot(userId, channelId)` so UI can reuse the latest known participant metadata even if presence briefly drops that user from the visible list.
- `src/components/VoiceChannel.jsx` now renders watched screen shares from a merged list of live participants + watched remote streams backed by participant snapshots.
- The auto-retry watcher in `VoiceChannel` also uses `getParticipantSnapshot(...)`, so a watched stream can continue/retry even if the avatar temporarily disappears from the participant grid.
- Build verified successfully with `npm run build` (`2.5.46`).

## 2026-04-16 tray-exit-voice-cleanup handoff
- Fixed the long-standing Electron-only bug where exiting Vibe from the tray while inside voice left the next launch in a fake "still connected" state.
- Root cause: tray quit could kill or reopen the app before renderer-side voice cleanup fully finished, leaving stale local voice state and a lingering `voice_sessions` row for the same local client.
- `electron/main.cjs` now sends `app-quit-requested` to the renderer and waits up to ~1.8s for `app-quit-ready` before calling `app.quit()`.
- `electron/preload.js` exposes `onAppQuitRequested()` / `notifyAppQuitReady()` to the web app.
- `src/hooks/useVoice.js` now persists a local client session marker (`vibe_local_voice_session`), clears it on normal cleanup, and deletes the orphaned local session on the next launch if the previous exit did not finish cleanly.
- `src/hooks/useVoice.js` also listens for Electron quit requests and runs `cleanupAll()` before acknowledging the quit, which clears `activeChannelId`, tears down media, and removes the local voice session before shutdown.
- Validation: `npm run build` passed on `2.5.47`; `node --check electron/main.cjs`; `node --check electron/preload.js`.

## 2026-04-16 chat-scroll-lock handoff
- Fixed the long-standing UX bug where scrolling upward in a text channel or DM would snap back down to the latest message after about a second.
- Root cause: both `src/components/TextChannel.jsx` and `src/components/DirectMessagePanel.jsx` had an unconditional `scrollTo({ top: scrollHeight, behavior: 'smooth' })` effect tied to every `messages` change.
- Both components now track whether the viewport is already near the bottom (`shouldStickToBottomRef`) and only auto-scroll in that case, or when switching to a different channel / DM target.
- Added `onScroll={updateStickToBottomState}` in both message containers so manual upward reading disables auto-stick until the user returns near the bottom.
- Validation: `npm run build` passed on `2.5.49`.

## 2026-04-16 remote-tray-exit-stale-participant handoff
- Root cause: remote clients kept restoring a participant from peer/audio/snapshot fallback even after the user exited through the tray, because WebRTC closed slower than oice_sessions disappeared and snapshot grace kept the UI alive.
- Cleanup hardening in src/hooks/voice/cleanup.js: send user-left on global/local channels before removing the realtime channel, untrack global presence immediately, wait ~150ms for websocket flush, then remove oice_sessions row.
- Remote cleanup hardening in src/hooks/useVoice.js: added orphanedRemotePeerTimersRef and 
econcileRemotePeerPresence(nextParticipants); whenever fresh oice_sessions data says a user is gone, schedule forced closePeer(...), snapshot purge, and participant removal within ~4s.
- Result: tray-exited users should disappear quickly for everyone else instead of lingering ~1 minute with a stale watch-stream button.

pm run build succeeded (2.5.50).

## 2026-04-16 startup-crash-tdz-usevoice handoff
- After the remote tray-exit cleanup patch, src/hooks/useVoice.js crashed on app load with ReferenceError: Cannot access 'ke' before initialization in production.
- Root cause: 
econcileRemotePeerPresence was declared before mutateRealtimeParticipants and closePeer, but referenced both in its dependency array/body. In bundled prod code this became a TDZ access during hook setup.
- Fix: move the primary mutateRealtimeParticipants and closePeer callback declarations above 
econcileRemotePeerPresence, remove duplicate lower declarations, rebuild.

pm run build succeeded (2.5.51).

## 2026-04-16 startup-crash-second-tdz-fix handoff
- The first startup-crash fix only moved closePeer; production still crashed with another minified TDZ error (Cannot access 'be' before initialization).
- Root cause: 
econcileRemotePeerPresence still referenced mutateRealtimeParticipants before its declaration via dependency array/body.
- Final fix: order in src/hooks/useVoice.js is now pplyParticipantMap -> closePeer -> mutateRealtimeParticipants -> reconcileRemotePeerPresence -> refreshVoiceSessions.

pm run build succeeded (2.5.53).

## 2026-04-16 voice-sessions-console-spam handoff
- Symptom: repeated console warnings [useVoice] Voice sessions refresh failed: TypeError: Cannot read properties of undefined (reading 'current').
- Root cause in src/hooks/useVoice.js: 
econcileRemotePeerPresence() passed orphanedRemotePeerTimersRef.current[userId] into clearManagedTimeout, but clearManagedTimeout expects a ref object with .current, not a raw timeout id.
- Fix: call native clearTimeout(...) on the stored timer id and then delete the map entry.

pm run build succeeded (2.5.54).

## 2026-04-16 stale-local-voice-controls-after-refresh handoff
- Symptom: after browser refresh while inside a voice channel, the UI still showed local voice controls (Leave, Stream, mute/deafen) even when the user was no longer truly connected and the participant count dropped to 0.
- Root issue: VoiceChannel.jsx trusted ctiveChannelId as a UI source of truth, but that can lag behind real local voice teardown/reload state.
- Fix: introduce localVoiceChannelId in src/hooks/useVoice.js, set it only when a real local session/media setup is established, clear it in src/hooks/voice/cleanup.js, and gate isInThisChannel in src/components/VoiceChannel.jsx by localVoiceChannelId === channel.id || hasSelfInThisChannel.
- Result: reloads should no longer leave phantom local control buttons when the user is not actually in voice.

pm run build succeeded (2.5.55).

## 2026-04-16 local-refresh-ghost-ui-hardening handoff
- Previous fix was insufficient because VoiceChannel.jsx still treated hasSelfInThisChannel (from stale participant lists) as proof the local user was connected.
- New rule: local controls are gated strictly by localVoiceChannelId, not by seeing the current user inside llParticipants.
- src/components/VoiceChannel.jsx: isInThisChannel now depends on localVoiceChannelId === channel.id; stale self participant rows no longer keep local control buttons alive after refresh.
- src/components/Sidebar.jsx: hides the current user's stale voice-channel sub-row unless the local voice session is actually active in that channel.

pm run build succeeded (2.5.56).

## 2026-04-16 voice-self-ghost-dedup-and-purge handoff
- Symptom: repeated browser refreshes while in voice accumulated multiple copies of the same user in the channel (Test x4), even after the local control buttons were hidden.
- Root cause had two layers:
  1) oice_sessions allowed multiple stale rows for the same user_id with different session_ids after interrupted refresh/cleanup.
  2) UI builders (uildVoiceParticipantsMap, uildParticipantMapFromPresenceState) preserved those duplicates instead of collapsing them to one visible user.
- Fixes:
  - src/lib/voiceSessions.js: dedupe participants per channel by userId, keep latest row, add 
emoveVoiceSessionsForUser(userId, excludeSessionId).
  - src/hooks/voice/participants.js: dedupe presence by userId instead of sessionId.
  - src/hooks/useVoice.js: if a local voice marker exists on startup, purge all lingering voice sessions for the current user before refreshing; before joining a voice channel, also delete older rows for that user.
- Result: repeated refreshes should stop accumulating self-ghost participants, and the user should appear at most once per voice channel.

pm run build succeeded (2.5.57).

## 2026-04-16 startup-orphan-cleanup-race handoff
- Symptom: users could join a voice channel, hear each other normally, and then 2-4 seconds later lose all local voice UI (leave/mute/stream buttons, center participant cards, left sub-row) while audio kept working. Re-clicking "join" only caused a brief reconnect sound before the UI vanished again.
- Root cause in `src/hooks/useVoice.js`: the startup orphan-session cleanup ran asynchronously on mount. If the user rejoined voice before that cleanup finished, it deleted the old marker/session and then cleared the fresh local marker/state from the new session. Result: WebRTC peers stayed alive, but the app believed the local voice session was gone.
- Fix:
  - added `readLocalVoiceSessionMarker()` helper;
  - startup cleanup now deletes only `marker.sessionId` instead of deleting all `voice_sessions` rows for the current user;
  - startup cleanup now checks whether localStorage already contains a newer marker and skips any reset if a new live session replaced the old one.
- Validation:
  - `npm run build` succeeded (`2.5.58`).

## 2026-04-17 voice-participants-sourced-from-local-presence handoff
- Symptom: during long voice sessions, remote users could disappear from the center participant grid and left voice-channel sub-list while audio still worked. The user also noticed participants often came back when they started speaking.
- Root cause hypothesis confirmed in code:
  1. UI was sourcing participants primarily from `voice_sessions` polling, not from the live local voice-channel presence stream.
  2. `voice_sessions` stale threshold/cleanup was too aggressive (`25s`) for real-world timer throttling / missed heartbeats.
  3. realtime participant updates were partially blocked whenever `serverVoiceStateRef.current === true`, so a healthy SQL poll could still suppress useful live presence repairs.
- Fixes:
  - `src/hooks/useVoice.js`: added `syncLocalChannelParticipantsToUi(channel)` which rebuilds the current channel's visible participants from `channel.presenceState()` and merges that through `buildConnectedPeerFallbackMap(...)`.
  - `src/hooks/voice/localChannelBootstrap.js`: local Realtime voice presence `sync`, `join`, and `leave` now call both `syncParticipants(channel)` and `syncLocalChannelParticipantsToUi(channel)`.
  - `src/hooks/useVoice.js`: removed the `serverVoiceStateRef.current` early return from `mutateRealtimeParticipants`, so live events can still refresh the UI while SQL polling is active.
  - `src/hooks/useVoice.js`: global presence heartbeat now always tracks while in channel, not only when server voice state is considered unhealthy.
  - `src/lib/voiceSessions.js`: raised `VOICE_SESSION_STALE_MS` from `25000` to `90000`.
  - `src/hooks/useVoice.js`: `cleanupStaleVoiceSessions(...)` call raised from `25` to `90`.
  - `voice-sessions-hardening.sql`: SQL function default `cleanup_stale_voice_sessions` updated from `25` to `90`.
- Why this should help:
  - if SQL rows lag or briefly expire, the active local voice-channel presence can now keep UI participants alive;
  - the longer stale window reduces accidental disappearance for quiet users who are still connected.
- Validation:
  - `npm run build` succeeded (`2.5.60`).

## 2026-04-17 participant-stale-ms-runtime-fix handoff
- Investigated production console spam and intermittent voice reconnects.
- Root cause: src/hooks/useVoice.js used PARTICIPANT_STALE_MS in syncLocalChannelParticipantsToUi(...) but did not import it from src/hooks/voice/participants.js.
- Impact: runtime ReferenceError repeatedly broke voice refresh/update flows and caused unstable UI/state in active calls.
- Fix: added the missing import for PARTICIPANT_STALE_MS.

- Validation: npm run build succeeded and version synced to 2.5.61.

## 2026-04-17 voice-reconnect-loop-root-cause handoff
- Investigated the deeper reconnect instability after the missing-import fix.
- Root cause:
  - `src/hooks/voice/channelStatus.js` scheduled delayed reconnects on local voice-channel `CLOSED` / `CHANNEL_ERROR`, but did not cancel them when the same channel later recovered and emitted `SUBSCRIBED`.
  - `src/hooks/voice/globalPresence.js` had the same stale recovery pattern for `global_voice_presence`, except the delayed recovery used raw re-init callbacks with no centralized cancellation.
  - If Supabase Realtime recovered on its own before the delay expired, those stale callbacks still fired and tore down healthy channels anyway.
- Why the symptoms looked confusing:
  - presence membership flickered because healthy Realtime channels were being destroyed/recreated after successful self-recovery;
  - users could disappear/reappear or blink after exit while WebRTC audio kept living, because peer connections were more resilient than the presence/session channel lifecycle.
- Fix:
  - `src/hooks/voice/channelStatus.js`: clear pending reconnect on `SUBSCRIBED` and refuse delayed reconnect when `channel.state` is already `joined`;
  - `src/hooks/useVoice.js`: add `globalPresenceRecoveryTimerRef`, move global recovery onto managed timeouts, cancel stale global recovery before re-init / cleanup, and clear pending local reconnect timer at the start of `joinVoiceChannel(...)`;
  - `src/hooks/voice/globalPresence.js`: clear pending global recovery on `SUBSCRIBED` and skip delayed re-init if the same channel already recovered;
  - `src/hooks/voice/localChannelBootstrap.js`: pass `clearManagedTimeout` into local status handling.
- Validation:
  - `npm run build` succeeded (`2.5.62`).

## 2026-04-17 global-presence-self-recovery-loop handoff
- The previous reconnect-loop fix was necessary but not sufficient.
- Fresh logs showed repeated `Global channel status: CLOSED` even after stale recovery timers were managed.
- Root cause:
  - `src/hooks/useVoice.js` `initGlobalChannel()` intentionally removed the previous `global_voice_presence` channel during recovery;
  - however `globalPresence.current` still pointed at that old channel while `removeChannel(...)` was in flight;
  - the old channel's status handler therefore saw its own intentional `CLOSED` as a real disconnect and scheduled yet another recovery.
- Effect:
  - global presence could re-enter a self-generated recovery loop;
  - that churn could destabilize visible voice membership and likely contributed to the downstream local voice reconnects seen in logs.
- Fix:
  - in `initGlobalChannel()`, move the current channel into `previousGlobalChannel`, set `globalPresence.current = null` first, then remove the old channel;
  - apply the same ordering in the effect cleanup path so intentional teardown cannot be mistaken for an unexpected loss.
- Validation:
  - `npm run build` succeeded (`2.5.63`).
