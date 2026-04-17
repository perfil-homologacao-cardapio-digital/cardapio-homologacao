// Visual theme presets. Each theme overrides core HSL CSS variables.
// Keys MUST match values stored in settings.theme_mode.

export type ThemeMode =
  | 'default'
  | 'black_orange'
  | 'black_red'
  | 'purple'
  | 'pink'
  | 'red';

export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  border: string;
  input: string;
  ring: string;
}

// HSL values only (no `hsl()` wrapper) — matches index.css convention.
export const THEMES: Record<Exclude<ThemeMode, 'default'>, ThemeTokens> = {
  black_orange: {
    background: '20 14% 8%',
    foreground: '30 20% 95%',
    card: '20 14% 12%',
    'card-foreground': '30 20% 95%',
    popover: '20 14% 12%',
    'popover-foreground': '30 20% 95%',
    primary: '24 95% 55%',
    'primary-foreground': '0 0% 100%',
    secondary: '20 14% 16%',
    'secondary-foreground': '30 20% 95%',
    muted: '20 14% 16%',
    'muted-foreground': '30 10% 65%',
    accent: '24 50% 20%',
    'accent-foreground': '24 90% 75%',
    border: '20 14% 20%',
    input: '20 14% 20%',
    ring: '24 95% 55%',
  },
  black_red: {
    background: '0 0% 7%',
    foreground: '0 0% 96%',
    card: '0 0% 11%',
    'card-foreground': '0 0% 96%',
    popover: '0 0% 11%',
    'popover-foreground': '0 0% 96%',
    primary: '0 80% 55%',
    'primary-foreground': '0 0% 100%',
    secondary: '0 0% 16%',
    'secondary-foreground': '0 0% 96%',
    muted: '0 0% 16%',
    'muted-foreground': '0 0% 65%',
    accent: '0 50% 22%',
    'accent-foreground': '0 80% 80%',
    border: '0 0% 20%',
    input: '0 0% 20%',
    ring: '0 80% 55%',
  },
  purple: {
    background: '270 40% 98%',
    foreground: '270 30% 15%',
    card: '0 0% 100%',
    'card-foreground': '270 30% 15%',
    popover: '0 0% 100%',
    'popover-foreground': '270 30% 15%',
    primary: '270 70% 55%',
    'primary-foreground': '0 0% 100%',
    secondary: '270 30% 94%',
    'secondary-foreground': '270 30% 15%',
    muted: '270 20% 95%',
    'muted-foreground': '270 10% 45%',
    accent: '270 60% 95%',
    'accent-foreground': '270 70% 35%',
    border: '270 20% 90%',
    input: '270 20% 88%',
    ring: '270 70% 55%',
  },
  pink: {
    background: '340 50% 98%',
    foreground: '340 25% 15%',
    card: '0 0% 100%',
    'card-foreground': '340 25% 15%',
    popover: '0 0% 100%',
    'popover-foreground': '340 25% 15%',
    primary: '335 75% 58%',
    'primary-foreground': '0 0% 100%',
    secondary: '340 40% 95%',
    'secondary-foreground': '340 25% 15%',
    muted: '340 25% 95%',
    'muted-foreground': '340 10% 45%',
    accent: '335 70% 95%',
    'accent-foreground': '335 75% 38%',
    border: '340 25% 90%',
    input: '340 25% 88%',
    ring: '335 75% 58%',
  },
  red: {
    background: '0 30% 98%',
    foreground: '0 20% 12%',
    card: '0 0% 100%',
    'card-foreground': '0 20% 12%',
    popover: '0 0% 100%',
    'popover-foreground': '0 20% 12%',
    primary: '0 80% 50%',
    'primary-foreground': '0 0% 100%',
    secondary: '0 25% 95%',
    'secondary-foreground': '0 20% 12%',
    muted: '0 15% 95%',
    'muted-foreground': '0 10% 45%',
    accent: '0 70% 95%',
    'accent-foreground': '0 80% 35%',
    border: '0 15% 90%',
    input: '0 15% 88%',
    ring: '0 80% 50%',
  },
};

export const THEME_LABELS: Record<ThemeMode, string> = {
  default: 'Padrão',
  black_orange: 'Preto + Laranja',
  black_red: 'Preto + Vermelho',
  purple: 'Roxo',
  pink: 'Rosa',
  red: 'Vermelho',
};

// Small swatch colors for the admin select (CSS color strings).
export const THEME_SWATCHES: Record<ThemeMode, [string, string]> = {
  default: ['hsl(30 25% 97%)', 'hsl(24 90% 50%)'],
  black_orange: ['hsl(20 14% 8%)', 'hsl(24 95% 55%)'],
  black_red: ['hsl(0 0% 7%)', 'hsl(0 80% 55%)'],
  purple: ['hsl(270 40% 98%)', 'hsl(270 70% 55%)'],
  pink: ['hsl(340 50% 98%)', 'hsl(335 75% 58%)'],
  red: ['hsl(0 30% 98%)', 'hsl(0 80% 50%)'],
};

export function applyTheme(mode: ThemeMode | string | null | undefined) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const safe = (mode || 'default') as ThemeMode;
  const tokens = safe !== 'default' ? THEMES[safe as Exclude<ThemeMode, 'default'>] : null;

  // Clear any previously set theme overrides so we always fall back to index.css defaults.
  const allKeys: (keyof ThemeTokens)[] = [
    'background', 'foreground', 'card', 'card-foreground',
    'popover', 'popover-foreground', 'primary', 'primary-foreground',
    'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'border', 'input', 'ring',
  ];
  for (const k of allKeys) root.style.removeProperty(`--${k}`);

  if (tokens) {
    for (const k of allKeys) {
      root.style.setProperty(`--${k}`, tokens[k]);
    }
  }
}
