import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatPhone, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Loader2, Phone, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type DateFilter = 'today' | 'tomorrow' | 'week' | 'month' | 'custom';

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = (iso || '').split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * Maps the underlying order.status to an operational "agenda" status.
 * Does NOT introduce new DB values — only re-labels existing ones.
 */
const AGENDA_STATUS_MAP: Record<string, { key: string; label: string; color: string; nextStatus?: string; nextLabel?: string }> = {
  new:              { key: 'scheduled',    label: 'Agendado',            color: 'bg-blue-500 text-white',       nextStatus: 'preparing',        nextLabel: 'Iniciar produção' },
  preparing:        { key: 'in_production',label: 'Em produção',         color: 'bg-yellow-500 text-black',     nextStatus: 'ready',            nextLabel: 'Marcar pronto' },
  ready:            { key: 'ready_pickup', label: 'Pronto para retirada',color: 'bg-emerald-500 text-white',    nextStatus: 'delivered',        nextLabel: 'Marcar retirado' },
  out_for_delivery: { key: 'ready_pickup', label: 'Pronto para retirada',color: 'bg-emerald-500 text-white',    nextStatus: 'delivered',        nextLabel: 'Marcar retirado' },
  delivered:        { key: 'picked_up',    label: 'Retirado',            color: 'bg-muted text-muted-foreground' },
  cancelled:        { key: 'cancelled',    label: 'Cancelado',            color: 'bg-destructive text-destructive-foreground' },
};

export function AdminAgenda() {
  const queryClient = useQueryClient();
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const today = new Date();
  const [customStart, setCustomStart] = useState<string>(toLocalDateInput(today));
  const [customEnd, setCustomEnd] = useState<string>(toLocalDateInput(today));

  // Orders with preorder_date set (agenda only)
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['admin-agenda-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .not('preorder_date', 'is', null)
        .order('preorder_date', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });

  // Realtime: any change to orders refreshes the agenda
  useEffect(() => {
    const channel = supabase
      .channel('agenda-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-agenda-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const orderIds = useMemo(() => orders.map(o => o.id), [orders]);

  const { data: orderItems = [] } = useQuery({
    queryKey: ['admin-agenda-items', orderIds.join(',')],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: orderIds.length > 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-agenda-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const updatePaymentStatus = useMutation({
    mutationFn: async ({ id, payment_status }: { id: string; payment_status: string }) => {
      const { error } = await supabase.from('orders').update({ payment_status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-agenda-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  // Filter by preorder_date range
  const filtered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start: Date | null = null;
    let end: Date | null = null;

    if (dateFilter === 'today') {
      start = startOfToday;
      end = new Date(startOfToday); end.setDate(end.getDate() + 1);
    } else if (dateFilter === 'tomorrow') {
      start = new Date(startOfToday); start.setDate(start.getDate() + 1);
      end = new Date(start); end.setDate(end.getDate() + 1);
    } else if (dateFilter === 'week') {
      start = startOfToday;
      end = new Date(startOfToday); end.setDate(end.getDate() + 7);
    } else if (dateFilter === 'month') {
      start = startOfToday;
      end = new Date(startOfToday); end.setMonth(end.getMonth() + 1);
    } else if (dateFilter === 'custom') {
      start = new Date(customStart + 'T00:00:00');
      end = new Date(customEnd + 'T00:00:00'); end.setDate(end.getDate() + 1);
    }

    return orders
      .filter(o => {
        if (!o.preorder_date) return false;
        const d = new Date((o.preorder_date as string).split('T')[0] + 'T00:00:00');
        if (start && d < start) return false;
        if (end && d >= end) return false;
        return true;
      })
      .sort((a, b) => {
        const da = (a.preorder_date as string).split('T')[0];
        const db = (b.preorder_date as string).split('T')[0];
        if (da !== db) return da.localeCompare(db);
        const ta = (a.preorder_time as string) || '99:99';
        const tb = (b.preorder_time as string) || '99:99';
        return ta.localeCompare(tb);
      });
  }, [orders, dateFilter, customStart, customEnd]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-extrabold">Agenda de Encomendas</h1>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {([
            { k: 'today', label: 'Hoje' },
            { k: 'tomorrow', label: 'Amanhã' },
            { k: 'week', label: 'Semana' },
            { k: 'month', label: 'Mês' },
            { k: 'custom', label: 'Personalizado' },
          ] as { k: DateFilter; label: string }[]).map(opt => (
            <Button
              key={opt.k}
              size="sm"
              variant={dateFilter === opt.k ? 'default' : 'outline'}
              className="rounded-lg"
              onClick={() => setDateFilter(opt.k)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {dateFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma encomenda agendada para este período.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const items = orderItems.filter((i: any) => i.order_id === order.id);
            const agenda = AGENDA_STATUS_MAP[order.status] || AGENDA_STATUS_MAP.new;
            const paymentStatus = (order.payment_status as string) || 'pending';
            const paymentInfo = PAYMENT_STATUSES[paymentStatus as keyof typeof PAYMENT_STATUSES] || PAYMENT_STATUSES.pending;

            return (
              <div key={order.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="text-center px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 min-w-[72px]">
                      <div className="text-xs text-muted-foreground">{formatDateBR(order.preorder_date)}</div>
                      <div className="text-lg font-extrabold flex items-center justify-center gap-1 text-primary">
                        <Clock className="h-4 w-4" />
                        {order.preorder_time || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-1"><User className="h-3.5 w-3.5" /> {order.customer_name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {formatPhone(order.customer_phone)}</div>
                      <div className="text-xs text-muted-foreground">Pedido #{order.order_number}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn('text-[11px]', agenda.color)}>{agenda.label}</Badge>
                    <Badge className={cn('text-[11px]', paymentInfo.color)}>{paymentInfo.label}</Badge>
                  </div>
                </div>

                <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Total:</span> <strong className="text-primary">{formatCurrency(Number(order.total))}</strong></div>
                  <div><span className="text-muted-foreground">Pagamento:</span> <strong>{PAYMENT_METHODS[order.payment_method as keyof typeof PAYMENT_METHODS] || order.payment_method}</strong></div>
                  {order.needs_change && order.change_amount && (
                    <div><span className="text-muted-foreground">Troco:</span> <strong>{formatCurrency(Number(order.change_amount))}</strong></div>
                  )}
                </div>

                {items.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="text-xs font-bold text-muted-foreground mb-1">Itens</div>
                    <ul className="text-sm space-y-1">
                      {items.map((it: any) => (
                        <li key={it.id} className="flex justify-between gap-2">
                          <span>{it.quantity}x {it.product_name}</span>
                          <span className="text-muted-foreground">{formatCurrency(Number(it.subtotal))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {order.notes && (
                  <div className="border-t pt-3">
                    <div className="text-xs font-bold text-muted-foreground mb-1">Observações</div>
                    <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                  </div>
                )}

                <div className="border-t pt-3 flex flex-wrap items-center gap-2">
                  {agenda.nextStatus && agenda.nextLabel && (
                    <Button
                      size="sm"
                      className="rounded-lg"
                      onClick={() => updateStatus.mutate({ id: order.id, status: agenda.nextStatus! })}
                      disabled={updateStatus.isPending}
                    >
                      {agenda.nextLabel}
                    </Button>
                  )}
                  <Select
                    value={paymentStatus}
                    onValueChange={(v) => updatePaymentStatus.mutate({ id: order.id, payment_status: v })}
                  >
                    <SelectTrigger className="w-40 h-9 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_STATUSES).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
