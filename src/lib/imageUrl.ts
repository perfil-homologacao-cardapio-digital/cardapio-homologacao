/**
 * Build an optimized image URL for Supabase-hosted images.
 * Falls back to the original URL for non-Supabase images.
 *
 * Supabase image transforms work via:
 *   /storage/v1/render/image/public/<bucket>/<path>?width=...&quality=...
 * We rewrite `/storage/v1/object/public/...` -> `/storage/v1/render/image/public/...`
 *
 * Safe: if the transform endpoint isn't available, the browser will still
 * fetch the original (the rewrite is a Supabase-recognized path).
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  opts: { width?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' } = {}
): string {
  if (!url) return '';
  // Only transform Supabase storage URLs
  if (!url.includes('/storage/v1/object/public/')) return url;

  const { width, quality = 70, resize = 'cover' } = opts;
  try {
    const transformed = url.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/'
    );
    const u = new URL(transformed);
    if (width) u.searchParams.set('width', String(width));
    u.searchParams.set('quality', String(quality));
    u.searchParams.set('resize', resize);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Build a srcset string with multiple widths for responsive images.
 */
export function getImageSrcSet(
  url: string | null | undefined,
  widths: number[],
  quality = 70
): string {
  if (!url || !url.includes('/storage/v1/object/public/')) return '';
  return widths
    .map(w => `${getOptimizedImageUrl(url, { width: w, quality })} ${w}w`)
    .join(', ');
}
