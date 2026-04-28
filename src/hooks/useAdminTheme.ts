import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'admin_theme_mode';
type Mode = 'light' | 'dark';

function readStored(): Mode {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyClass(mode: Mode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

/**
 * Admin-only light/dark theme toggle.
 * - Persists preference in localStorage.
 * - Applies the `dark` class to <html> while admin is mounted.
 * - On unmount, removes the class so the storefront stays in its own theme.
 */
export function useAdminTheme() {
  const [mode, setMode] = useState<Mode>(() => readStored());

  // Apply on mount + whenever mode changes
  useEffect(() => {
    applyClass(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode]);

  // Cleanup when admin unmounts (so storefront isn't forced into dark)
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('dark');
      }
    };
  }, []);

  const toggle = useCallback(() => {
    setMode(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { mode, toggle, isDark: mode === 'dark' };
}
