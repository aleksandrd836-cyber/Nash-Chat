/**
 * Утилита для сжатия изображений на стороне клиента (VibeChat Optimizer)
 */

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const QUALITY = 0.82; // Золотая середина между качеством и весом

/**
 * Сжимает изображение с использованием HTML Canvas
 * @param {File} file - Оригинальный файл
 * @returns {Promise<Blob|File>} - Сжатый файл (или оригинал, если это не картинка)
 */
export async function compressImage(file) {
  // Если это не картинка или это GIF (хотя мы их блокируем на входе), возвращаем как есть
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // Рассчитываем новые размеры
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Экспортируем в JPEG (он лучше всего жмет фото)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            // Создаем новый файл на базе блоба, сохраняя имя (но меняя расширение на .jpg для предсказуемости)
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            console.log(`[VibeOptimizer] Сжато: ${(file.size / 1024).toFixed(1)}KB -> ${(compressedFile.size / 1024).toFixed(1)}KB`);
            resolve(compressedFile);
          },
          'image/jpeg',
          QUALITY
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}
