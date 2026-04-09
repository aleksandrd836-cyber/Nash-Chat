# Vibe AI Context Index

Этот файл — главная точка входа для любой новой ИИ-сессии по проекту `Vibe`.

## Сначала читать
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\ARCHITECTURE_STATE.md`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\VOICE_SYSTEM_STATE.md`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\SESSION_MEMORY.md`
- `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\AI_HANDOFF.md`

## Кратко о проекте
- `Vibe` — Discord-подобное приложение.
- Стек: `React 18 + Vite + Electron + Zustand + Supabase + WebRTC`.
- Самый сложный и хрупкий участок: `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useVoice.js`.

## Что важно помнить
- Пользователь не программист; код правит ИИ, пользователь обычно только выполняет git-команды и SQL в Supabase.
- Все SQL-миграции лучше дублировать прямо текстом в чат, а не только ссылкой на файл.
- Для пуша пользователь предпочитает один короткий блок команд PowerShell.

## Основные зоны проекта
- Авторизация и invite-коды: `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useAuth.js`
- Личные сообщения и вложения: `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useDirectMessages.js`
- Голосовая система: `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\hooks\useVoice.js`
- UI голосовых каналов: `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\src\components\VoiceChannel.jsx`
- База / схема: `C:\Users\Александр\.gemini\antigravity\scratch\discord-clone\full-setup.sql`

## Правило обновления
- После крупных изменений нужно обновлять:
  - `ARCHITECTURE_STATE.md`
  - `VOICE_SYSTEM_STATE.md` если затрагивался voice
  - `SESSION_MEMORY.md`
  - `AI_HANDOFF.md`
