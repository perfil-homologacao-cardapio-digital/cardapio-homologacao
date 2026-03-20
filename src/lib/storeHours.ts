// Weekly schedule types and utilities

export interface DaySchedule {
  isOpen: boolean;
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

export type WeeklySchedule = Record<string, DaySchedule>;

export const DAY_LABELS: Record<string, string> = {
  '0': 'Domingo',
  '1': 'Segunda-feira',
  '2': 'Terça-feira',
  '3': 'Quarta-feira',
  '4': 'Quinta-feira',
  '5': 'Sexta-feira',
  '6': 'Sábado',
};

export const DEFAULT_SCHEDULE: WeeklySchedule = {
  '0': { isOpen: false, open: '18:00', close: '23:00' },
  '1': { isOpen: true, open: '18:00', close: '23:00' },
  '2': { isOpen: true, open: '18:00', close: '23:00' },
  '3': { isOpen: true, open: '18:00', close: '23:00' },
  '4': { isOpen: true, open: '18:00', close: '23:00' },
  '5': { isOpen: true, open: '18:00', close: '23:00' },
  '6': { isOpen: true, open: '18:00', close: '23:00' },
};

/** Generate time options from 00:00 to 23:30 in 30-min increments */
export function getTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
}

/** Parse stored JSON string into WeeklySchedule, falling back to defaults */
export function parseSchedule(raw: string | undefined | null): WeeklySchedule {
  if (!raw) return { ...DEFAULT_SCHEDULE };
  try {
    const parsed = JSON.parse(raw);
    // Validate structure
    const schedule: WeeklySchedule = {};
    for (let d = 0; d <= 6; d++) {
      const key = String(d);
      const day = parsed[key];
      if (day && typeof day.isOpen === 'boolean' && typeof day.open === 'string' && typeof day.close === 'string') {
        schedule[key] = { isOpen: day.isOpen, open: day.open, close: day.close };
      } else {
        schedule[key] = { ...DEFAULT_SCHEDULE[key] };
      }
    }
    return schedule;
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
}

/**
 * Check if the store is currently open based on the weekly schedule.
 * Uses America/Sao_Paulo timezone.
 */
export function isStoreOpen(schedule: WeeklySchedule): boolean {
  const now = new Date();
  
  // Get current time in São Paulo timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  
  const parts = formatter.formatToParts(now);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  
  // Map weekday abbreviation to JS day number
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayNum = weekdayMap[weekdayStr] ?? now.getDay();
  const dayKey = String(dayNum);
  
  const today = schedule[dayKey];
  if (!today || !today.isOpen) return false;
  
  const currentMinutes = hour * 60 + minute;
  const [openH, openM] = today.open.split(':').map(Number);
  const [closeH, closeM] = today.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  
  // Handle overnight shifts (e.g., 18:00 to 02:00)
  if (closeMinutes <= openMinutes) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

/**
 * Get a human-readable summary of today's hours.
 */
export function getTodayHoursLabel(schedule: WeeklySchedule): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  });
  const weekdayStr = formatter.format(now);
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayNum = weekdayMap[weekdayStr] ?? now.getDay();
  const today = schedule[String(dayNum)];
  
  if (!today || !today.isOpen) return 'Fechado hoje';
  return `Hoje: ${today.open} às ${today.close}`;
}
