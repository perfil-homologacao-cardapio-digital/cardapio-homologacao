import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { Package, ShoppingCart, Clock, DollarSign, CalendarIcon, Crown } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type RevenuePeriod = 'today' | '7days' | '15days' | 'custom';

const PERIOD_LABELS: Record<RevenuePeriod, string> = {
  today: 'Receita Hoje',
  '7days': 'Receita 7 dias',
  '15days': 'Receita 15 dias',
  custom: 'Receita no período',
};

function getStartOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function AdminDashboard() {
  const { data: settings } = useSettings();
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>('today');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { data: orders = [] } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.created_at.startsWith(today));
  const pendingOrders = orders.filter(o => o.status === 'new' || o.status === 'preparing');

  // Revenue calculation based on period
  const getRevenueOrders = () => {
    const now = new Date();
    switch (revenuePeriod) {
      case 'today':
        return orders.filter(o => o.created_at.startsWith(today));
      case '7days': {
        const start = getStartOfDay(new Date(now.getTime() - 6 * 86400000));
        return orders.filter(o => new Date(o.created_at) >= start);
      }
      case '15days': {
        const start = getStartOfDay(new Date(now.getTime() - 14 * 86400000));
        return orders.filter(o => new Date(o.created_at) >= start);
      }
      case 'custom': {
        if (!customFrom || !customTo) return [];
        const start = getStartOfDay(customFrom);
        const end = new Date(customTo);
        end.setHours(23, 59, 59, 999);
        return orders.filter(o => {
          const d = new Date(o.created_at);
          return d >= start && d <= end;
        });
      }
      default:
        return todayOrders;
    }
  };

  const revenueValue = getRevenueOrders().reduce((s, o) => s + Number(o.total), 0);

  const stats = [
    { label: 'Total de Pedidos', value: orders.length, icon: ShoppingCart, color: 'text-primary' },
    { label: 'Pedidos Hoje', value: todayOrders.length, icon: Package, color: 'text-success' },
    { label: 'Pendentes', value: pendingOrders.length, icon: Clock, color: 'text-warning' },
  ];

    const planType = settings?.plan_type;
    const planExpires = settings?.plan_expires_at;
    const formattedExpiry = planExpires
      ? planExpires.split('-').reverse().join('/')
      : '';

    return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6">Dashboard</h1>

      {planType && planExpires && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/50 bg-accent/50 px-4 py-3">
          <Crown className="h-5 w-5 text-primary shrink-0" />
          <div className="text-sm">
            <span className="font-bold text-foreground">{planType}</span>
            <span className="text-muted-foreground ml-2">· Válido até {formattedExpiry}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <Card key={s.label} className="rounded-xl border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-extrabold">{s.value}</div>
            </CardContent>
          </Card>
        ))}

        {/* Revenue card with period filter */}
        <Card className="rounded-xl border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{PERIOD_LABELS[revenuePeriod]}</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xl font-extrabold">{formatCurrency(revenueValue)}</div>
            <Select value={revenuePeriod} onValueChange={(v) => setRevenuePeriod(v as RevenuePeriod)}>
              <SelectTrigger className="h-7 text-[11px] w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="15days">Últimos 15 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {revenuePeriod === 'custom' && (
              <div className="flex flex-col gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-7 text-[10px] flex-1 justify-start", !customFrom && "text-muted-foreground")}>
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {customFrom ? format(customFrom, 'dd/MM/yy') : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-7 text-[10px] flex-1 justify-start", !customTo && "text-muted-foreground")}>
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {customTo ? format(customTo, 'dd/MM/yy') : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-bold mb-3">Últimos Pedidos</h2>
      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum pedido ainda</p>
      ) : (
        <div className="space-y-2">
          {orders.slice(0, 5).map(o => (
            <div key={o.id} className="flex items-center justify-between bg-card border border-border/50 rounded-xl p-3">
              <div>
                <span className="font-bold text-sm">#{o.order_number}</span>
                <span className="text-muted-foreground text-xs ml-2">{o.customer_name}</span>
              </div>
              <span className="font-bold text-sm text-primary">{formatCurrency(Number(o.total))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
