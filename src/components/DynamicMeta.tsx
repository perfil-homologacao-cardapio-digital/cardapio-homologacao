import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';

/**
 * Dynamically updates favicon and Open Graph meta tags
 * based on the logo_url stored in settings.
 */
export function DynamicMeta() {
  const { data: settings } = useSettings();
  const logoUrl = settings?.logo_url || '';
  const businessName = settings?.business_name || 'Delícias da Casa';

  useEffect(() => {
    if (!logoUrl) return;

    // Update favicon
    const updateLink = (selector: string, href: string) => {
      const el = document.querySelector(selector) as HTMLLinkElement | null;
      if (el) el.href = href;
    };
    updateLink('link[rel="icon"]', logoUrl);
    updateLink('link[rel="apple-touch-icon"]', logoUrl);

    // Update OG and Twitter meta tags
    const updateMeta = (selector: string, value: string, attr = 'content') => {
      const el = document.querySelector(selector) as HTMLMetaElement | null;
      if (el) el.setAttribute(attr, value);
    };

    const title = `${businessName} - Cardápio Online`;
    const description = 'Peça online de forma rápida e sem taxas.';

    updateMeta('meta[property="og:title"]', title);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:image"]', logoUrl);
    updateMeta('meta[name="twitter:title"]', title);
    updateMeta('meta[name="twitter:description"]', description);
    updateMeta('meta[name="twitter:image"]', logoUrl);

    // Also update document title
    document.title = title;
  }, [logoUrl, businessName]);

  return null;
}
