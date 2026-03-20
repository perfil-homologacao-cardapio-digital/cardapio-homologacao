import { useSettings } from '@/hooks/useSettings';
import { parseSchedule, isStoreOpen, getTodayHoursLabel } from '@/lib/storeHours';

/**
 * Hook that checks if the store is currently open based on weekly_schedule setting.
 * Returns { isOpen, todayLabel, isLoading }
 */
export function useStoreOpen() {
  const { data: settings, isLoading } = useSettings();
  
  const schedule = parseSchedule(settings?.weekly_schedule);
  const open = isStoreOpen(schedule);
  const todayLabel = getTodayHoursLabel(schedule);
  
  return { isOpen: open, todayLabel, isLoading };
}
