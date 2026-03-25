import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type WeeklySchedule, DAY_LABELS, getTimeOptions } from '@/lib/storeHours';
import { Plus, X } from 'lucide-react';

interface Props {
  schedule: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
}

const TIME_OPTIONS = getTimeOptions();

function TimeSelect({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="rounded-lg h-9 w-[90px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {TIME_OPTIONS.map(t => (
          <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function WeeklyScheduleEditor({ schedule, onChange }: Props) {
  const updateDay = (dayKey: string, field: string, value: any) => {
    onChange({
      ...schedule,
      [dayKey]: { ...schedule[dayKey], [field]: value },
    });
  };

  const addSecondShift = (dayKey: string) => {
    onChange({
      ...schedule,
      [dayKey]: { ...schedule[dayKey], open2: '18:00', close2: '23:00' },
    });
  };

  const removeSecondShift = (dayKey: string) => {
    const { open2, close2, ...rest } = schedule[dayKey];
    onChange({ ...schedule, [dayKey]: rest });
  };

  return (
    <div className="space-y-3">
      <Label className="font-bold">Horário de funcionamento</Label>
      <p className="text-xs text-muted-foreground mb-1">Defina o horário de abertura e fechamento para cada dia da semana. Você pode adicionar um segundo turno opcional.</p>
      <div className="space-y-2">
        {['1', '2', '3', '4', '5', '6', '0'].map(dayKey => {
          const day = schedule[dayKey];
          const hasSecondShift = !!(day.open2 && day.close2);
          return (
            <div key={dayKey} className="bg-accent/50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-28 flex-shrink-0">
                  <span className="text-sm font-semibold">{DAY_LABELS[dayKey]}</span>
                </div>
                <Switch
                  checked={day.isOpen}
                  onCheckedChange={v => updateDay(dayKey, 'isOpen', v)}
                />
                {day.isOpen ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <TimeSelect value={day.open} onValueChange={v => updateDay(dayKey, 'open', v)} />
                    <span className="text-xs text-muted-foreground">às</span>
                    <TimeSelect value={day.close} onValueChange={v => updateDay(dayKey, 'close', v)} />
                    {!hasSecondShift && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground" onClick={() => addSecondShift(dayKey)} title="Adicionar 2º turno">
                        <Plus className="h-3 w-3" /> 2º turno
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Fechado</span>
                )}
              </div>
              {day.isOpen && hasSecondShift && (
                <div className="flex items-center gap-3 pl-[calc(7rem+12px+36px+12px)]">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <TimeSelect value={day.open2!} onValueChange={v => updateDay(dayKey, 'open2', v)} />
                    <span className="text-xs text-muted-foreground">às</span>
                    <TimeSelect value={day.close2!} onValueChange={v => updateDay(dayKey, 'close2', v)} />
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeSecondShift(dayKey)} title="Remover 2º turno">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}