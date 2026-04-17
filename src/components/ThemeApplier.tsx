import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';
import { applyTheme } from '@/lib/themes';

/**
 * Applies the visual theme stored in settings.theme_mode to <html> via CSS vars.
 * On the admin panel, dark themes (black_orange, black_red) fall back to "default"
 * because they don't suit the admin UI. All other themes apply everywhere.
 */
export function ThemeApplier() {
  const { data: settings } = useSettings();
  const location = useLocation();

  useEffect(() => {
    const mode = settings?.theme_mode || 'default';
    const isAdmin = location.pathname.startsWith('/admin');
    const darkThemes = ['black_orange', 'black_red'];
    const effective = isAdmin && darkThemes.includes(mode) ? 'default' : mode;
    applyTheme(effective);
  }, [settings?.theme_mode, location.pathname]);

  return null;
}
