/**
 * Compress an image file to target size (default 150KB).
 * Returns a new File object with the compressed image.
 */
export async function compressImage(
  file: File,
  maxSizeKB = 50,
  maxWidth = 1600,
  maxHeight = 1600,
  initialQuality = 0.82
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

/**
 * ADDITIVE: Compress + resize + convert to WebP for new uploads.
 * Targets ~targetKB (default 50KB). Falls back to lowest acceptable quality
 * if it can't reach the target. If WebP isn't supported by the browser,
 * gracefully falls back to the existing JPEG compressor (no regression).
 *
 * Does NOT replace `compressImage` — existing flows are untouched unless
 * the caller opts-in by importing this function.
 */
export async function compressImageToWebp(
  file: File,
  targetKB = 50,
  maxWidth = 800,
  maxHeight = 800,
  initialQuality = 0.85,
  minQuality = 0.4
): Promise<File> {
  // Feature-detect WebP encoding support
  const supportsWebp = await new Promise<boolean>((resolve) => {
    try {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      c.toBlob((b) => resolve(!!b && b.type === 'image/webp'), 'image/webp');
    } catch {
      resolve(false);
    }
  });

  if (!supportsWebp) {
    // Safe fallback: behave like before (JPEG)
    return compressImage(file, targetKB, maxWidth, maxHeight, initialQuality);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
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

      const targetBytes = targetKB * 1024;

      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression failed'));
              return;
            }
            if (blob.size > targetBytes && quality > minQuality) {
              tryCompress(Math.max(minQuality, quality - 0.1));
            } else {
              const newName = file.name.replace(/\.[^.]+$/, '.webp');
              const compressed = new File([blob], newName, {
                type: 'image/webp',
                lastModified: Date.now(),
              });
              resolve(compressed);
            }
          },
          'image/webp',
          quality
        );
      };

      tryCompress(initialQuality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
