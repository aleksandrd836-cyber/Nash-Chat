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
### 2026-04-10 emoji picker lazy loading pass
- emoji-picker-react ?????? ?? ????????????? ???????? ? TextChannel, DirectMessagePanel ? Message.
- ???????? src/components/LazyEmojiPicker.jsx, ??????? ?????? picker ?????? ????? React.lazy + Suspense ? ?????? ???????? ?????? ??????.
- ? src/components/Message.jsx ?????? emoji ? ?????????? ? ???????? ????????? ?? ?????? ???????? glyph-span, ????? ??????? ???????? ???? ?? ??????? ?? ?????? picker.
- ?????? 
pm run build ???????; emoji vendor ???????? ????????? ?????? ? ?????? ?????? ???????????? ?? ??????????.

### Auto Log — 2026-04-10 14:25
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/DirectMessagePanel.jsx`
  - `src/components/LazyEmojiPicker.jsx`
  - `src/components/Message.jsx`
  - `src/components/TextChannel.jsx`

### 2026-04-10 lazy route Suspense fix
- Fixed a production login crash after bundle splitting.
- Root cause: lazy-loaded route panels in `src/App.jsx` (`Hub`, `DirectMessagePanel`, `TextChannel`, `VoiceChannel`, `MembersPanel`) were rendered without a surrounding `Suspense` boundary in the main app layout.
- Added `Suspense` around the central panel area with `PanelLoadingFallback` and around `MembersPanel` with `LoadingFallback`.
- Also wrapped navigation/modal-opening state transitions in `startTransition` to make lazy UI switches safer under React 18.
- Files touched in this fix:
  - `src/App.jsx`

### Auto Log — 2026-04-10 14:50
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`

### 2026-04-10 voice UI rerender optimization pass
- Reduced avoidable rerenders in `src/components/VoiceChannel.jsx` and `src/components/Sidebar.jsx` after the larger voice refactor.
- `VoiceChannel.jsx` changes:
  - added `memo` for `ScreenPlayer`
  - introduced memoized `channelParticipants`, `hasSelfInThisChannel`, `participantMap`, and `participantIdsKey`
  - split localStorage volume restore from the global `volumeChanged` event listener
  - replaced repeated participant lookups with `Map` reads
  - hoisted creator ID checks into a shared `Set`
  - memoized context-menu avatar/volume derivations
- `Sidebar.jsx` changes:
  - memoized flattened voice participants and text/voice channel lists
  - split volume restore from the `volumeChanged` listener
  - memoized context-menu avatar/volume derivations
  - hoisted creator ID checks into a shared `Set`
- `npm run build` passed after this optimization pass.
- Files touched in this pass:
  - `src/components/VoiceChannel.jsx`
  - `src/components/Sidebar.jsx`

### Auto Log — 2026-04-10 15:01
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/Sidebar.jsx`
  - `src/components/VoiceChannel.jsx`

### 2026-04-10 direct messages runtime fix
- Fixed a DM crash caused by a missing helper in `src/components/Message.jsx`.
- Root cause: the component still called `isPlatformCreator(authorId)` after previous message/emoji refactors, but the helper definition was no longer present.
- Restored the platform-creator check via a shared `Set` + helper function at module scope.
- File touched:
  - `src/components/Message.jsx`

### Auto Log — 2026-04-10 15:09
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/Message.jsx`

### 2026-04-10 direct messages emoji regex fix
- Fixed a second DM runtime crash in `src/components/Message.jsx`.
- Root cause: `MessageContent` still used `EMOJI_REGEX` for emoji splitting and inline rendering after the emoji refactor, but the regex constant itself was missing.
- Restored a module-level emoji regex that supports pictographic emoji, regional-indicator flags, and keycap emoji.
- File touched:
  - `src/components/Message.jsx`

### 2026-04-10 Message component hardening pass
- Performed a focused runtime hardening pass on `src/components/Message.jsx` after multiple DM-related regressions.
- Added `normalizeMessageText(...)` so message editing/copy/render paths do not depend on `msg.content` always being a valid string.
- Added guarded helpers for emoji picker theme detection and clipboard copying to avoid direct fragile browser-global assumptions.
- Reused profile/server color data more safely in display color calculation.
- This pass was intentionally limited to realistic runtime-safety fixes rather than visual refactoring.
- File touched:
  - `src/components/Message.jsx`

### Auto Log — 2026-04-10 15:29
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/Message.jsx`

### 2026-04-10 message read-status icon fix
- Replaced broken text-based read-status glyphs in `src/components/Message.jsx` with Lucide icons (`Check` / `CheckCheck`).
- This avoids future mojibake issues from file encoding and keeps read indicators visually stable.
- File touched:
  - `src/components/Message.jsx`

### Auto Log — 2026-04-10 15:38
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/Message.jsx`

### 2026-04-10 message expiry and cleanup hardening
- Fixed corrupted expiry tooltip text in `src/components/Message.jsx` by restoring clean Russian strings for the 14-day auto-delete label.
- Reduced jumbo emoji size and removed extra scaling in emoji-only messages to prevent vertical overlap between neighboring messages.
- Verified the repository-level auto-delete design and found a real setup gap: cleanup cron jobs existed in `ephemeral_messages.sql`, but were not embedded into `full-setup.sql`.
- Fixed that gap by making `ephemeral_messages.sql` idempotent and by adding the same hourly cleanup cron setup into `full-setup.sql`.
- This means fresh database setups now include the 14-day cleanup automatically instead of depending on a separate manual SQL step.
- Files touched:
  - `src/components/Message.jsx`
  - `ephemeral_messages.sql`
  - `full-setup.sql`

### Auto Log — 2026-04-10 15:59
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `ephemeral_messages.sql`
  - `full-setup.sql`
  - `package.json`
  - `public/version.json`
  - `src/components/Message.jsx`

### Auto Log — 2026-04-11 02:22
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`

### 2026-04-11 visual system foundation pass
- Started step 1 of the UI redesign plan: define a shared visual system before redesigning individual screens.
- Tightened core design tokens in `src/index.css`: deeper dark surfaces, stronger light-theme contrast, shared radii, border strength, panel shadows, shell gradients, and accent glow levels.
- Added reusable shell utilities: `vibe-shell`, `vibe-rail`, `vibe-panel`, `vibe-panel-strong`, `vibe-icon-tile`, `vibe-primary-button`, `vibe-label-eyebrow`, `vibe-divider-soft`, and `vibe-nav-orb`.
- Applied the new system to the app shell and core navigation surfaces so the product already looks more unified without doing a full screen redesign yet.
- Updated key shell components to consume the shared style language:
  - `src/App.jsx`
  - `src/components/ServerSidebar.jsx`
  - `src/components/Sidebar.jsx`
  - `src/components/ProfileFooter.jsx`
  - `src/components/UserPanel.jsx`
  - `src/components/Hub.jsx`
- Also fixed a long-standing Tailwind mismatch by mapping `ds-accent` to the CSS variable and adding `ds-border` in `tailwind.config.js`.
- Verification: `npm run build` passed on version `2.5.28`.

### Auto Log — 2026-04-11 02:39
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`
  - `src/components/Hub.jsx`
  - `src/components/ProfileFooter.jsx`
  - `src/components/ServerSidebar.jsx`
  - `src/components/Sidebar.jsx`
  - `src/components/UserPanel.jsx`
  - `src/index.css`
  - `tailwind.config.js`

### 2026-04-11 optical centering correction
- After the visual-system foundation pass, multiple center-stage screens looked visually pulled upward.
- Root cause was not one bug, but a composition imbalance: the floating DM button sat too high (`bottom-40`) and the main center-stage layouts did not reserve enough bottom breathing room after the new shell styling.
- Applied an optical-centering correction in:
  - `src/App.jsx` (empty server state + lowered FAB)
  - `src/components/Hub.jsx` (more balanced top/bottom spacing)
  - `src/components/VoiceChannel.jsx` (center-stage voice layout shifted into a more balanced vertical position)
- Verification: `npm run build` passed on version `2.5.29`.

### Auto Log — 2026-04-11 02:48
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`
  - `src/components/Hub.jsx`
  - `src/components/VoiceChannel.jsx`

### 2026-04-11 shell height correction
- Follow-up to the false optical-centering diagnosis: the real issue was an empty strip below the app shell, not a pure layout shift.
- Root fix: removed reliance on the top-level `fixed inset-0` shell and switched the main app container to explicit viewport sizing in `src/App.jsx` (`w-screen h-screen min-h-[100svh]`).
- Reinforced root sizing in `src/index.css` by giving `html`, `body`, and `#root` explicit `min-height: 100vh` / `100svh` and `width: 100%`.
- This should eliminate the detached empty bottom area in both browser and Electron windows.
- Verification: `npm run build` passed on version `2.5.30`.

### Auto Log — 2026-04-11 02:56
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`
  - `src/index.css`

### 2026-04-11 accent token and theme pass
- Fixed a root color-token bug that made multiple accent buttons render too dark or nearly black.
- Root cause: Tailwind semantic colors were defined as `rgb(var(--token) / alpha)` while the project stores RGB components with commas (for example `0, 240, 255`), which leads to invalid CSS in some cases.
- Updated `tailwind.config.js` to use `rgba(var(--token), <alpha-value>)` for semantic colors so `bg-ds-accent`, `text-ds-*`, `border-ds-*`, and related utilities render reliably.
- Completed the first real theme pass in `src/index.css`:
  - improved light-theme contrast and muted text
  - strengthened panel/rail surfaces in light mode
  - refined shell background layering for light mode
  - improved primary button visibility and shadow treatment in both themes
- Also moved the most visible CTA buttons in `src/components/VoiceChannel.jsx` and `src/components/TextChannel.jsx` onto the shared `vibe-primary-button` utility so they stay consistent across themes.
- Verification: `npm run build` passed on version `2.5.31`.

### Auto Log — 2026-04-11 03:07
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/TextChannel.jsx`
  - `src/components/VoiceChannel.jsx`
  - `src/index.css`
  - `tailwind.config.js`

### 2026-04-11 DM creator badge and FAB layout fix
- Fixed mojibake in direct-message author badges inside `src/components/Message.jsx` by restoring clean Russian labels for the platform-creator and server-admin chips (`���������`, `�����`).
- Fixed the floating DM button overlap problem in `src/App.jsx`.
- The FAB now uses contextual placement: on screens with a bottom composer (`activeDM` or text channel) it moves higher so it does not cover the send area; on other screens it stays lower.
- Continued the theme pass after those fixes by moving more chat surfaces onto the shared panel system:
  - `src/components/DirectMessagePanel.jsx`
  - `src/components/TextChannel.jsx`
  - `src/components/VoiceChannel.jsx`
- Headers and composer/input containers now use the shared `vibe-panel` / `vibe-panel-strong` styling, which especially improves light-theme depth and consistency.
- Verification: `npm run build` passed on version `2.5.32`.

### Auto Log — 2026-04-11 03:19
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`
  - `src/components/DirectMessagePanel.jsx`
  - `src/components/Message.jsx`
  - `src/components/TextChannel.jsx`
  - `src/components/VoiceChannel.jsx`

### 2026-04-11 theme continuation: side surfaces and modal polish
- Continued theme step 2 beyond chat/voice composers into the remaining high-visibility side surfaces.
- Rebuilt `src/components/MembersPanel.jsx` onto the shared rail/panel language:
  - right rail now uses the same shell system as other sidebars
  - member rows have deeper hover/selection surfaces
  - creator badge text is normalized (`���������`)
  - fixed owner highlighting path by correctly passing `ownerId` into member rows
- Restyled `src/components/Sidebar/ChannelItem.jsx` for stronger hierarchy in both themes: better active state, cleaner owner controls, and more premium hover states.
- Restyled `src/components/Sidebar/VoiceParticipant.jsx` to match the updated side-panel language and normalized its creator badge label.
- Polished `src/components/ServerEntryModal.jsx` so the create/join modal now uses the shared panel system and primary CTA styling instead of older one-off dark boxes.
- Verification: `npm run build` passed on version `2.5.33`.

### Auto Log — 2026-04-11 03:28
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/MembersPanel.jsx`
  - `src/components/ServerEntryModal.jsx`
  - `src/components/Sidebar/ChannelItem.jsx`
  - `src/components/Sidebar/VoiceParticipant.jsx`

### 2026-04-11 channel RLS + theme pass
- Root cause of channel creation failure was confirmed: `public.channels` had RLS enabled but no `INSERT / UPDATE / DELETE` policies.
- Added owner-only channel management policies to `full-setup.sql` and created `channel-rls-hardening.sql` for live Supabase projects.
- `src/components/Sidebar.jsx` now translates Supabase `42501` into a human explanation instead of only showing the raw database message.
- Continued theme step 2 with shared surface primitives in `src/index.css`:
  - stronger `vibe-primary-button`
  - new `vibe-secondary-button`
  - new `vibe-form-field`
- Applied the shared theme primitives to `src/components/AuthPage.jsx` so login/register fields and CTA now look more consistent in both dark and light themes.

### Auto Log — 2026-04-11 03:44
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `channel-rls-hardening.sql`
  - `full-setup.sql`
  - `package.json`
  - `public/version.json`
  - `src/components/AuthPage.jsx`
  - `src/components/Sidebar.jsx`
  - `src/index.css`

### 2026-04-11 theme continuation: settings and server modals
- Continued theme step 2 into the remaining utility surfaces.
- `src/components/SettingsModal.jsx` now uses the shared `vibe-panel`, `vibe-form-field`, and `vibe-secondary-button` language for profile, audio, notification, and app-update sections.
- `src/components/ServerSettingsModal.jsx` now matches the same system: cleaner invite block, readable member rows in both themes, and more consistent action buttons.
- `src/components/HotkeysSettings.jsx` was also aligned with the shared panel treatment so the settings stack no longer visually breaks in desktop mode.
- Verification: `npm run build` passed on version `2.5.35`.

### Auto Log — 2026-04-11 03:50
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/HotkeysSettings.jsx`
  - `src/components/ServerSettingsModal.jsx`
  - `src/components/SettingsModal.jsx`

### 2026-04-11 server creation + server invite fix
- Fixed another RLS gap: server creation was blocked because `public.servers` and `public.server_members` had no write policies for owner flows.
- Added owner-scoped create/update/delete policies for `servers` and owner membership/delete policies for `server_members` in `full-setup.sql`.
- Added `server-rls-hardening.sql` for live Supabase apply.
- Hardened `join_server_by_invite` to normalize codes by stripping spaces and dashes before lookup, reducing false `not_found` results when users type formatted codes manually.
- Updated `src/components/ServerEntryModal.jsx` to normalize join codes client-side and show clearer permission errors on server creation.
- Updated `src/components/ServerSettingsModal.jsx` so the invite code can be focused/selected directly, and copy now also selects the code field first.
- Verification: `npm run build` passed on version `2.5.36`.

### 2026-04-11 Supabase function redeploy fix
- PostgreSQL refused to replace `join_server_by_invite(text)` in-place on some projects with `42P13`.
- Fix: SQL hardening scripts now explicitly `DROP FUNCTION IF EXISTS ...` before recreating `join_server_by_invite(TEXT)`.
- Added `GRANT EXECUTE` after recreation so authenticated users can still call the RPC immediately.
- If Supabase already has the old function, re-run only the updated function block starting with `DROP FUNCTION IF EXISTS public.join_server_by_invite(TEXT);`.

### 2026-04-11 server modals utf8 + clipboard fix
- `src/components/ServerEntryModal.jsx` and `src/components/ServerSettingsModal.jsx` were rewritten cleanly after mojibake text appeared in UI.
- Restored all Russian labels in create/join server flow and in server settings sections.
- Invite-code copy is now more reliable: tries Clipboard API first, then `execCommand('copy')`, and finally opens a manual copy prompt if the environment still blocks clipboard access.
- Verification: `npm run build` passed on `2.5.37`.

### 2026-04-11 invite field selection unblock
- The invite-code field in server settings was still blocked by the parent shell's `select-none` behavior and by a decorative glow layer sitting over the card.
- Fix: invite block overlays now use `pointer-events-none`, the input is promoted above the glow with `relative z-10`, and the field forces `user-select: text`.
- Copy flow was also hardened with explicit `setSelectionRange(0, inviteCode.length)` before clipboard attempts.
- User-facing strings in the two server modals were moved to ASCII-safe `\uXXXX` literals to avoid another mojibake regression.
- Verification: `npm run build` passed on `2.5.38`.

### 2026-04-11 server delete hardening
- Direct `delete()` on `servers` was too fragile and gave the user no visible error when DB-side constraints or hidden tables blocked cascade removal.
- Added RPC `delete_owned_server(UUID)` in `server-delete-hardening.sql` and mirrored it into `full-setup.sql`.
- The function validates ownership via `auth.uid()`, then explicitly removes `channel_last_read`, `message_reactions`, `messages`, `channels`, `server_members`, and finally the server itself.
- `src/components/ServerSettingsModal.jsx` now deletes through the RPC and shows an alert if Supabase returns an error instead of failing silently.
- Verification: `npm run build` passed on `2.5.39`.

### 2026-04-11 server actions rpc pass
- Continued the server-management hardening beyond delete: create server, regenerate invite code, kick member, rename server, and avatar update now avoid raw table mutations in the UI.
- Added `server-management-hardening.sql` plus matching definitions in `full-setup.sql` for:
  - `create_owned_server(TEXT)`
  - `update_owned_server(UUID, TEXT, TEXT)`
  - `regenerate_server_invite_code(UUID)`
  - `remove_server_member(UUID, UUID)`
- `src/components/ServerEntryModal.jsx` now creates servers through RPC instead of direct inserts into `servers` + `server_members`.
- `src/components/ServerSettingsModal.jsx` now uses RPC for rename, invite regeneration, member kick, avatar update, and delete error surfacing.
- Goal of this pass: remove silent failures and centralize ownership checks in DB-side security-definer functions.
- Verification: `npm run build` passed on `2.5.40`.

### Auto Log — 2026-04-11 04:08
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `full-setup.sql`
  - `package.json`
  - `public/version.json`
  - `server-rls-hardening.sql`
  - `src/components/ServerEntryModal.jsx`
  - `src/components/ServerSettingsModal.jsx`

### Auto Log — 2026-04-11 04:22
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/ServerEntryModal.jsx`
  - `src/components/ServerSettingsModal.jsx`

### Auto Log — 2026-04-11 14:47
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/components/ServerEntryModal.jsx`
  - `src/components/ServerSettingsModal.jsx`

### Auto Log — 2026-04-11 14:59
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `full-setup.sql`
  - `package.json`
  - `public/version.json`
  - `server-delete-hardening.sql`
  - `src/components/ServerSettingsModal.jsx`

### Auto Log — 2026-04-11 15:08
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `full-setup.sql`
  - `package.json`
  - `public/version.json`
  - `server-management-hardening.sql`
  - `src/components/ServerEntryModal.jsx`
  - `src/components/ServerSettingsModal.jsx`

### Auto Log � 2026-04-11 15:35
- Fixed transient mojibake in message send state by replacing pending/edit/action labels in `src/components/Message.jsx` with clean string constants.
- Hardened stream renegotiation in `src/hooks/voice/screenShare.js`, `src/hooks/voice/signaling.js`, and `src/hooks/useVoice.js`:
  - removed fragile capture constraints from `getDisplayMedia`
  - apply quality via `track.applyConstraints(...)`
  - force renegotiation after adding/removing screen tracks
  - push `isScreenSharing` presence immediately on start/stop
- Added live server-state sync in `src/components/ServerSidebar.jsx` + `src/App.jsx` so server avatar/name updates propagate without re-login and kicked users are dropped out of the current server immediately.
- Build checkpoint: `npm run build` passed on `2.5.41`.

### Auto Log — 2026-04-11 15:45
- Автоматически записано git hook перед коммитом.
- Изменённые файлы:
  - `package.json`
  - `public/version.json`
  - `src/App.jsx`
  - `src/components/Message.jsx`
  - `src/components/ServerSidebar.jsx`
  - `src/components/VoiceChannel.jsx`
  - `src/hooks/useVoice.js`
  - `src/hooks/voice/screenShare.js`
  - `src/hooks/voice/signaling.js`
