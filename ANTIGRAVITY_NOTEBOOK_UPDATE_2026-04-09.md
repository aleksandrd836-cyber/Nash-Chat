# Vibe — сводка изменений за 2026-04-09

Этот файл сделан для быстрого обновления контекста в Antigravity / Gemini / NotebookLM.
Ниже перечислено, что именно менялось сегодня, какие файлы важны и что уже проверено.

## 1. Регистрация и invite-коды

### Что исправлено
- Усилена логика регистрации по invite-коду.
- Убрана хрупкая схема "проверили код -> создали аккаунт -> потом отдельно пометили использованным".
- Добавлен безопасный flow: резервирование кода, освобождение при ошибке, финализация после успешной регистрации.
- Добавлен SQL для hardening invite-кодов.

### Ключевые файлы
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useAuth.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\lib\inviteCodes.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\AuthPage.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\invite-code-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\seed-50-invite-codes.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\full-setup.sql`

### Статус
- SQL применён в Supabase.
- Созданы дополнительные рабочие invite-коды.
- Регистрация с кодами работает.

## 2. Приватность вложений в личных сообщениях

### Что исправлено
- Вложения в ЛС переведены с public URL на private bucket + signed URL.
- Исправлен рендер новых приватных вложений, включая preview изображений.
- Старые public-вложения автоматически приватными не становятся; защита касается новых вложений.

### Ключевые файлы
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useDirectMessages.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\lib\dmAttachments.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\Message.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\DirectMessagePanel.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\dm-private-attachments.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\full-setup.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\supabase-schema.sql`

### Статус
- SQL применён в Supabase.
- Новые DM-вложения работают через private storage.

## 3. Профиль и смена ника

### Что исправлено
- Смена ника и цвета профиля больше не размазана по клиенту в несколько неатомарных апдейтов.
- Добавлен единый серверный путь обновления профиля.
- Логин для входа не менялся: меняется отображаемый ник/цвет, а не способ авторизации.

### Ключевые файлы
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\SettingsModal.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\lib\profile.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\App.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useAuth.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\profile-update-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\full-setup.sql`

### Статус
- SQL применён в Supabase.
- Смена отображаемого ника стабилизирована.

## 4. Синхронизация версии приложения

### Что исправлено
- `public/version.json` теперь синхронизируется с `package.json`.
- Устранён рассинхрон версии между приложением и метаданными обновления.
- В сборочные скрипты добавлена автоматическая синхронизация version metadata.

### Ключевые файлы
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\package.json`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\public\version.json`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\scripts\sync-version-metadata.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\scripts\bump-version.js`

### Статус
- Сейчас актуальная версия: `2.5.10`.

## 5. Починка проблем после merge / pull

### Что произошло
- Был `git pull` во время параллельной работы с коллегой.
- После merge один из файлов склеился криво и сломал сборку.

### Что исправлено
- Исправлен post-merge build error в Direct Messages.

### Ключевой файл
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useDirectMessages.js`

### Статус
- Сборка снова проходит.

## 6. Голосовая система: крупная серия правок

### Общая идея
Сегодня основное внимание было на voice-ядре, потому что были жалобы на:
- "призраков" в голосовых каналах;
- пропадание иконок участников;
- зависание в старом канале после выхода;
- переподключение не в тот канал;
- вечное состояние "Подключение..." при уже активном входе.

### Что уже сделано
- Усилена очистка голосовых сессий по `sessionId`.
- Исправлены несколько гонок между global presence, local voice channel и UI.
- Добавлен серверный источник истины `voice_sessions`.
- Добавлена SQL-миграция для `voice_sessions`.
- Исправлен reconnect target, чтобы при переподключении не тянуло в старый канал.
- Исправлено залипание кнопки подключения в desktop UI.
- Начат реальный рефактор `useVoice.js`: вынесена часть helper-логики в отдельные модули.

### Новые / важные файлы
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\voice-sessions-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\lib\voiceSessions.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\voice\constants.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\voice\utils.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\voice\participants.js`

### Главный файл, который нужно внимательно сканировать
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useVoice.js`

### Связанные UI-файлы
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\VoiceChannel.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\Sidebar.jsx`

### Что особенно важно понять Gemini
- Голосовая система сейчас в переходном состоянии: она уже частично переведена на более чистую архитектуру, но `useVoice.js` всё ещё остаётся большим и сложным.
- Самый важный текущий вектор — дальнейшее деление `useVoice.js` на подсистемы:
  - voice session / presence source of truth;
  - reconnect state machine;
  - WebRTC peer lifecycle;
  - screen share / device controls.
- Файл `src/hooks/voice/participants.js` — это начало нормальной модульной декомпозиции голосовой логики.

## 7. Что уже было применено в Supabase

На сегодня пользователь уже запускал следующие SQL:
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\invite-code-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\dm-private-attachments.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\profile-update-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\voice-sessions-hardening.sql`

## 8. Что проверено вручную

- Регистрация с invite-кодом — работает.
- Генерация дополнительных invite-кодов — работает.
- Новые вложения в ЛС — работают через private bucket.
- Смена отображаемого ника — работает.
- Веб-сборка — проходит.
- По голосу: часть багов уже снята, но voice-система всё ещё требует дальнейшей стабилизации и рефактора.

## 9. Что Gemini / NotebookLM нужно обновить в первую очередь

### Высокий приоритет
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useVoice.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\voice\participants.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\lib\voiceSessions.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\VoiceChannel.jsx`

### Средний приоритет
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useDirectMessages.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\Message.jsx`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useAuth.js`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\SettingsModal.jsx`

### SQL / schema контекст
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\full-setup.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\supabase-schema.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\invite-code-hardening.sql`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\voice-sessions-hardening.sql`

## 10. Короткий вывод

За сегодня мы не просто "поправили пару багов", а:
- усилили регистрацию;
- закрыли приватность вложений в ЛС;
- стабилизировали смену профиля;
- синхронизировали version metadata;
- начали серьёзную декомпозицию голосового ядра.

Если Gemini будет пересканировать проект, главный акцент ей нужно делать на голосовую систему и новые вспомогательные модули вокруг `useVoice.js`.
