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
