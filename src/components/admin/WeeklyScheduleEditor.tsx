import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type WeeklySchedule, DAY_LABELS, getTimeOptions } from '@/lib/storeHours';

interface Props {
  schedule: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
}

const TIME_OPTIONS = getTimeOptions();

export function WeeklyScheduleEditor({ schedule, onChange }: Props) {
  const updateDay = (dayKey: string, field: string, value: any) => {
    onChange({
      ...schedule,
      [dayKey]: { ...schedule[dayKey], [field]: value },
    });
  };

  return (
    <div className="space-y-3">
      <Label className="font-bold">Horário de funcionamento</Label>
      <p className="text-xs text-muted-foreground mb-1">Defina o horário de abertura e fechamento para cada dia da semana.</p>
      <div className="space-y-2">
        {['1', '2', '3', '4', '5', '6', '0'].map(dayKey => {
          const day = schedule[dayKey];
          return (
            <div key={dayKey} className="flex items-center gap-3 bg-accent/50 rounded-xl p-3">
              <div className="w-28 flex-shrink-0">
                <span className="text-sm font-semibold">{DAY_LABELS[dayKey]}</span>
              </div>
              <Switch
                checked={day.isOpen}
                onCheckedChange={v => updateDay(dayKey, 'isOpen', v)}
              />
              {day.isOpen ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Select value={day.open} onValueChange={v => updateDay(dayKey, 'open', v)}>
                    <SelectTrigger className="rounded-lg h-9 w-[90px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">às</span>
                  <Select value={day.close} onValueChange={v => updateDay(dayKey, 'close', v)}>
                    <SelectTrigger className="rounded-lg h-9 w-[90px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">Fechado</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
