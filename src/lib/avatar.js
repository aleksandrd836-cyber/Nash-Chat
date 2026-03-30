/**
 * Генерирует детерминированный Memoji-аватар.
 * Выбирает один из 35 классических готовых Apple 3D Memoji картинок.
 */
export function getUserAvatar(username) {
  // Защита от null/undefined — если ника нет, используем пустую строку
  const name = username || '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // У нас есть 15 мужских готовых Apple Memoji файлов в коллекции Github
  const maleMemojiIds = [1, 3, 9, 13, 14, 15, 16, 22, 23, 24, 26, 30, 32, 34, 35];
  const memojiId = maleMemojiIds[Math.abs(hash) % maleMemojiIds.length];
  return {
    // Вшитые исходные Memoji
    imageUrl: `https://raw.githubusercontent.com/alohe/memojis/main/png/memo_${memojiId}.png`,
    color: '#2a2d31'
  };
}
