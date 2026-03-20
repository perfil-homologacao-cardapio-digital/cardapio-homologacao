/**
 * Compress an image file to target size (default 150KB).
 * Returns a new File object with the compressed image.
 */
export async function compressImage(
  file: File,
  maxSizeKB = 150,
  maxWidth = 1200,
  maxHeight = 1200,
  initialQuality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if too large
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const targetBytes = maxSizeKB * 1024;

      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression failed'));
              return;
            }

            // If still too large and quality can be reduced, try again
            if (blob.size > targetBytes && quality > 0.1) {
              tryCompress(quality - 0.1);
            } else {
              const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressed);
            }
          },
          'image/jpeg',
          quality
        );
      };

      // If original is already small enough, still convert to jpeg for consistency
      tryCompress(initialQuality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
