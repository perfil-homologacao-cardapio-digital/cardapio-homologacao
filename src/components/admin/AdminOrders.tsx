import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, formatPhone, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Printer, Eye, Trash2, ChevronLeft, ChevronRight, MessageCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useSettings } from '@/hooks/useSettings';
import { buildAdminWhatsAppMessage } from '@/lib/adminWhatsAppMessage';
import { SalesReport } from './SalesReport';
const ITEMS_PER_PAGE = 10;

type DateFilter = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface AdminOrdersProps {
  onOrderViewed?: (orderId: string) => void | Promise<void>;
}

export function AdminOrders({ onOrderViewed }: AdminOrdersProps) {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data: settings } = useSettings();
  const storeName = settings?.business_name || 'Meu Estabelecimento';
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const today = new Date();
  const [customStart, setCustomStart] = useState<string>(toLocalDateInput(today));
  const [customEnd, setCustomEnd] = useState<string>(toLocalDateInput(today));
  const [reportOpen, setReportOpen] = useState(false);

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as (typeof data[number] & { opened_at: string | null })[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const mergeOrderIntoCache = useCallback((updatedOrder: any) => {
    if (!updatedOrder?.id) return;

    queryClient.setQueryData<any[]>(['admin-orders'], (current) => {
      if (!Array.isArray(current)) return current;

      let found = false;
      const next = current.map(order => {
        if (order.id !== updatedOrder.id) return order;
        found = true;
        return { ...order, ...updatedOrder };
      });

      return found ? next : current;
    });
  }, [queryClient]);

  const refreshOrderFromDatabase = useCallback(async (orderId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error('[AdminOrders] Falha ao buscar pedido atualizado', { orderId, error });
      return;
    }

    if (data) mergeOrderIntoCache(data);
  }, [mergeOrderIntoCache]);

  // Realtime: when any order is updated (e.g. webhook sets payment_status=paid),
  // automatically refresh the admin list — no manual action needed.
  useEffect(() => {
    const channel = supabase
      .channel('admin-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updatedOrder = payload.new as any;

          console.info('[AdminOrders] UPDATE recebido em orders', {
            id: updatedOrder?.id,
            payment_method: updatedOrder?.payment_method,
            payment_status: updatedOrder?.payment_status,
          });

          if (updatedOrder?.id) {
            mergeOrderIntoCache(updatedOrder);
            void refreshOrderFromDatabase(updatedOrder.id);
          }

          void queryClient.refetchQueries({ queryKey: ['admin-orders'], type: 'active' });
        }
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') console.info('[AdminOrders] Realtime inscrito em orders UPDATE');
        if (status === 'CHANNEL_ERROR') console.error('[AdminOrders] Erro no canal realtime de orders', error);
      });
    return () => { supabase.removeChannel(channel); };
  }, [mergeOrderIntoCache, queryClient, refreshOrderFromDatabase]);

  const { data: orderItems = [] } = useQuery({
    queryKey: ['admin-order-items', selectedOrder],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase.from('order_items').select('*').eq('order_id', selectedOrder);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrder,
  });

  const { data: orderItemSelections = [] } = useQuery({
    queryKey: ['admin-order-item-selections', selectedOrder],
    queryFn: async () => {
      if (!selectedOrder || !orderItems.length) return [];
      const itemIds = orderItems.map(i => i.id);
      const { data, error } = await supabase
        .from('order_item_selections')
        .select('*')
        .in('order_item_id', itemIds);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrder && orderItems.length > 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  });

  const updatePaymentStatus = useMutation({
    mutationFn: async ({ id, payment_status }: { id: string; payment_status: string }) => {
      const { error } = await supabase.from('orders').update({ payment_status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: 'Pedido excluído' });
    },
    onError: (err: any) => toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' }),
  });

  const order = orders.find(o => o.id === selectedOrder);

  const handleOpenOrder = async (orderId: string) => {
    setSelectedOrder(orderId);
    await onOrderViewed?.(orderId);
    await refreshOrderFromDatabase(orderId);
    void refetchOrders();
  };

  const filteredOrders = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date;
    if (dateFilter === 'today') {
      start = new Date(now); start.setHours(0, 0, 0, 0);
      end = new Date(now); end.setHours(23, 59, 59, 999);
    } else if (dateFilter === 'yesterday') {
      start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      end = new Date(start); end.setHours(23, 59, 59, 999);
    } else if (dateFilter === '7d') {
      start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      end = new Date(now); end.setHours(23, 59, 59, 999);
    } else if (dateFilter === '30d') {
      start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
      end = new Date(now); end.setHours(23, 59, 59, 999);
    } else {
      start = customStart ? new Date(customStart + 'T00:00:00') : new Date(0);
      end = customEnd ? new Date(customEnd + 'T23:59:59') : new Date(now);
    }
    const startMs = start.getTime();
    const endMs = end.getTime();
    return orders.filter(o => {
      const t = new Date(o.created_at).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [orders, dateFilter, customStart, customEnd]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const paginatedOrders = filteredOrders.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  // Reset page if it goes out of bounds
  if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));

  const handlePrint = () => {
    const is58 = settings?.printer_paper_width === '58mm';

    // Fallback to in-page print if popup is blocked or DOM not ready
    const fallbackPrint = () => {
      const body = document.body;
      const had = body.classList.contains('printer-58mm');
      if (is58) body.classList.add('printer-58mm');
      else body.classList.remove('printer-58mm');
      const cleanup = () => {
        if (!had) body.classList.remove('printer-58mm');
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => window.print(), 50);
    };

    // Locate the appropriate receipt node currently rendered in the dialog
    const selector = is58
      ? '[data-print-receipt-58="true"]'
      : '[data-print-receipt="true"]';
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) {
      fallbackPrint();
      return;
    }

    const popup = window.open(
      '',
      'print_order',
      'width=900,height=650,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
    );
    if (!popup) {
      fallbackPrint();
      return;
    }

    // Clone receipt HTML & make it visible (the source has display:none in 58mm)
    const html = node.outerHTML;
    const bodyClass = is58 ? 'printer-58mm' : '';
    const pageSize = is58 ? '58mm auto' : '80mm auto';
    const widthMm = is58 ? '58mm' : '80mm';

    // Reuse the project stylesheet so receipt classes (.receipt-58mm-*, .thermal-receipt) render identically
    const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML)
      .join('\n');

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Imprimir pedido</title>
${styleLinks}
<style>
  @page { size: ${pageSize}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  body { padding: 8px; }
  /* Force receipt visible on screen inside the popup */
  [data-print-receipt-58="true"], [data-print-receipt="true"] {
    display: block !important;
    visibility: visible !important;
    width: ${widthMm};
    max-width: ${widthMm};
    margin: 0 auto;
  }
</style>
</head>
<body class="${bodyClass}">
${html}
</body>
</html>`);
    popup.document.close();

    const triggerPrint = () => {
      try {
        popup.focus();
        popup.print();
      } catch {}
      // Try to auto-close after print dialog resolves
      const close = () => { try { popup.close(); } catch {} };
      popup.addEventListener('afterprint', close);
      // Fallback close in case afterprint never fires
      setTimeout(close, 60_000);
    };

    if (popup.document.readyState === 'complete') {
      setTimeout(triggerPrint, 150);
    } else {
      popup.addEventListener('load', () => setTimeout(triggerPrint, 150));
    }
  };

  const handleWhatsApp = () => {
    if (!order) return;
    const phone = order.customer_phone.replace(/\D/g, '');
    const phoneWithCountry = phone.length === 11 ? `55${phone}` : phone.length === 10 ? `55${phone}` : phone;
    const msg = buildAdminWhatsAppMessage({
      order,
      items: orderItems,
      selections: orderItemSelections,
      storeName,
    });

    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const filterButtons: { key: DateFilter; label: string }[] = [
    { key: 'today', label: 'Hoje' },
    { key: 'yesterday', label: 'Ontem' },
    { key: '7d', label: 'Últimos 7 dias' },
    { key: '30d', label: 'Últimos 30 dias' },
    { key: 'custom', label: 'Personalizado' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-extrabold">Pedidos</h1>
        <Button variant="outline" className="rounded-xl" onClick={() => setReportOpen(true)}>
          <FileText className="h-4 w-4 mr-2" /> Relatório de vendas
        </Button>
      </div>

      {/* Date filters */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          {filterButtons.map(b => (
            <Button
              key={b.key}
              variant={dateFilter === b.key ? 'default' : 'outline'}
              size="sm"
              className="rounded-lg"
              onClick={() => { setDateFilter(b.key); setPage(0); }}
            >
              {b.label}
            </Button>
          ))}
        </div>
        {dateFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); setPage(0); }} />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); setPage(0); }} />
            </div>
          </div>
        )}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Nenhum pedido neste período</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {paginatedOrders.map(o => {
              const statusInfo = ORDER_STATUSES[o.status as keyof typeof ORDER_STATUSES] || ORDER_STATUSES.new;
              const isViewed = !!o.opened_at;
              return (
                <div key={o.id} className={cn(
                  "border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3 transition-colors",
                  isViewed
                    ? "bg-card border-border/50"
                    : "bg-emerald-500/10 border-emerald-500/20"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold">#{o.order_number}</span>
                      <Badge className={cn('text-[10px]', statusInfo.color)}>{statusInfo.label}</Badge>
                      {(() => {
                        const status = (o as any).payment_status as string | undefined;
                        const method = o.payment_method as string | undefined;
                        let label: string = PAYMENT_STATUSES.pending.label;
                        let color: string = PAYMENT_STATUSES.pending.color;
                        if (status === 'paid') {
                          if (method === 'pix') { label = 'Pago via Pix'; color = 'bg-emerald-500 text-white'; }
                          else if (method === 'credit') { label = 'Pago via Cartão'; color = 'bg-blue-500 text-white'; }
                          else { label = 'Pago'; color = PAYMENT_STATUSES.paid.color; }
                        } else if (status === 'failed') {
                          label = PAYMENT_STATUSES.failed.label;
                          color = PAYMENT_STATUSES.failed.color;
                        }
                        return <Badge className={cn('text-[10px]', color)}>Pgto: {label}</Badge>;
                      })()}
                      {!isViewed && <Badge className="text-[10px] bg-orange-500 text-white">NOVO</Badge>}
                      <span className="text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{o.customer_name} • {formatPhone(o.customer_phone)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-bold text-primary">{formatCurrency(Number(o.total))}</span>
                    <Select value={o.status} onValueChange={v => updateStatus.mutate({ id: o.id, status: v })}>
                      <SelectTrigger className="w-32 h-8 rounded-lg text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ORDER_STATUSES).map(([key, val]) => (
                          <SelectItem key={key} value={key}>{val.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { void handleOpenOrder(o.id); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir pedido #{o.order_number}?</AlertDialogTitle>
                          <AlertDialogDescription>Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteOrder.mutate(o.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 -mx-4 md:mx-0 overflow-x-auto md:overflow-visible [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center md:justify-center gap-2 px-4 md:px-0 w-max md:w-auto min-w-full whitespace-nowrap">
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg shrink-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <Button
                    key={i}
                    variant={page === i ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 w-8 rounded-lg p-0 text-xs shrink-0"
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg shrink-0" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="order-print-dialog max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedido #{order?.order_number}</DialogTitle>
          </DialogHeader>
          {order && (
            <>
              {/* Normal dialog view - hidden on print */}
              <div className="space-y-4 text-sm no-print">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Cliente:</span> <strong>{order.customer_name}</strong></div>
                  <div><span className="text-muted-foreground">Telefone:</span> <strong>{formatPhone(order.customer_phone)}</strong></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Endereço:</span> <strong>{order.address}, {order.address_number}{order.complement ? ` - ${order.complement}` : ''}</strong></div>
                  {order.neighborhood_name && <div><span className="text-muted-foreground">Bairro:</span> <strong>{order.neighborhood_name}</strong></div>}
                  <div><span className="text-muted-foreground">Pagamento:</span> <strong>{PAYMENT_METHODS[order.payment_method as keyof typeof PAYMENT_METHODS] || order.payment_method}</strong></div>
                  {order.needs_change && <div><span className="text-muted-foreground">Troco para:</span> <strong>{order.change_amount ? formatCurrency(Number(order.change_amount)) : '-'}</strong></div>}
                  {order.preorder_date && <div><span className="text-muted-foreground">Data encomenda:</span> <strong>{order.preorder_date.split('-').reverse().join('/')}</strong></div>}
                  <div className="col-span-2 flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Status pgto:</span>
                    {(() => {
                      const status = (order as any).payment_status as string | undefined;
                      const method = order.payment_method as string | undefined;
                      let label: string = PAYMENT_STATUSES.pending.label;
                      let color: string = PAYMENT_STATUSES.pending.color;
                      if (status === 'paid') {
                        if (method === 'pix') { label = 'Pago via Pix'; color = 'bg-emerald-500 text-white'; }
                        else if (method === 'credit') { label = 'Pago via Cartão'; color = 'bg-blue-500 text-white'; }
                        else { label = 'Pago'; color = PAYMENT_STATUSES.paid.color; }
                      } else if (status === 'failed') {
                        label = PAYMENT_STATUSES.failed.label;
                        color = PAYMENT_STATUSES.failed.color;
                      }
                      return <Badge className={cn('text-[10px]', color)}>{label}</Badge>;
                    })()}
                    <Select value={(order as any).payment_status || 'pending'} onValueChange={v => updatePaymentStatus.mutate({ id: order.id, payment_status: v })}>
                      <SelectTrigger className="w-32 h-8 rounded-lg text-xs">
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

                <div className="border-t pt-3">
                  <h4 className="font-bold mb-2">Itens</h4>
{orderItems.map(item => {
                    const itemSels = orderItemSelections.filter(s => s.order_item_id === item.id);
                    const grouped = itemSels.reduce((acc, s) => {
                      const gn = s.group_name_snapshot || 'Opções';
                      if (!acc[gn]) acc[gn] = [];
                      acc[gn].push(s.option_name_snapshot || '');
                      return acc;
                    }, {} as Record<string, string[]>);
                    // Agrupa itens iguais para melhor leitura
                    const groupedWithCount = Object.entries(grouped).map(([gn, opts]) => {
                      const counts = opts.reduce((countAcc, opt) => {
                        if (opt) countAcc[opt] = (countAcc[opt] || 0) + 1;
                        return countAcc;
                      }, {} as Record<string, number>);
                      const formatted = Object.entries(counts).map(([name, count]) => 
                        count > 1 ? `${count}x ${name}` : name
                      );
                      return [gn, formatted] as [string, string[]];
                    });
                    return (
                      <div key={item.id} className="py-1 border-b border-border/30 last:border-0">
                        <div className="flex justify-between">
                          <span>{item.quantity}x {item.product_name}</span>
                          <span className="font-semibold">{formatCurrency(Number(item.subtotal))}</span>
                        </div>
                        {groupedWithCount.map(([gn, opts]) => {
                          const isCombo = gn === 'Itens do Combo';
                          if (isCombo) {
                            return (
                              <div key={gn} className="ml-4 mt-1">
                                <p className="text-xs font-semibold text-muted-foreground">{gn}:</p>
                                <ul className="text-xs text-muted-foreground ml-2">
                                   {opts.map((o, i) => (
                                    <li key={`${gn}-${i}`}>{o}</li>
                                  ))}
                                </ul>
                              </div>
                            );
                          }
                          return (
                            <div key={gn} className="ml-4 mt-1">
                              <p className="text-xs font-semibold text-muted-foreground">{gn}:</p>
                              <ul className="text-xs text-muted-foreground ml-2">
                                {opts.map((o, i) => (
                                  <li key={`${gn}-${i}`}>{o}</li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {(order as any).notes && (
                  <div className="border-t pt-3">
                    <h4 className="font-bold mb-1">📝 Observações do cliente</h4>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-accent/40 rounded-lg p-2">{(order as any).notes}</p>
                  </div>
                )}

                <div className="border-t pt-3 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(Number(order.subtotal))}</span></div>
                  {order.coupon_code && Number(order.discount_value) > 0 && (
                    <div className="flex justify-between text-emerald-600"><span>Cupom {order.coupon_code}</span><span>-{formatCurrency(Number(order.discount_value))}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>{Number(order.delivery_fee) === 0 ? 'Grátis' : formatCurrency(Number(order.delivery_fee))}</span></div>
                  <div className="flex justify-between font-extrabold text-lg"><span>Total</span><span className="text-primary">{formatCurrency(Number(order.total))}</span></div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={handleWhatsApp}>
                    <MessageCircle className="h-4 w-4 mr-2" /> Confirmar no WhatsApp
                  </Button>
                  <Button className="flex-1 rounded-xl" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" /> Imprimir
                  </Button>
                </div>
              </div>

              {/* ===== Dedicated 58mm receipt — only visible when printing in 58mm mode ===== */}
              <div className="receipt-58mm no-print-screen" data-print-receipt-58="true" style={{ display: 'none' }}>
                <div className="receipt-58mm-header">
                  <div className="receipt-58mm-store">{storeName}</div>
                  <div className="receipt-58mm-meta">Pedido #{order.order_number}</div>
                  <div className="receipt-58mm-meta">{formatDate(order.created_at)}</div>
                </div>
                <div className="receipt-58mm-sep" />
                <div className="receipt-58mm-section">
                  <div className="receipt-58mm-line"><strong>{order.customer_name}</strong></div>
                  <div className="receipt-58mm-line">{formatPhone(order.customer_phone)}</div>
                  {order.address === 'Retirada no balcão' ? (
                    <div className="receipt-58mm-line receipt-58mm-strong">RETIRADA NO BALCAO</div>
                  ) : (
                    <>
                      <div className="receipt-58mm-line">End: {order.address}, {order.address_number}</div>
                      {order.complement && <div className="receipt-58mm-line">{order.complement}</div>}
                      {order.neighborhood_name && <div className="receipt-58mm-line">{order.neighborhood_name}</div>}
                    </>
                  )}
                </div>
                <div className="receipt-58mm-sep" />
                <div className="receipt-58mm-section">
                  {orderItems.map(item => {
                    const itemSels = orderItemSelections.filter(s => s.order_item_id === item.id);
                    const grouped = itemSels.reduce((acc, s) => {
                      const gn = s.group_name_snapshot || 'Opções';
                      if (!acc[gn]) acc[gn] = [];
                      acc[gn].push(s.option_name_snapshot || '');
                      return acc;
                    }, {} as Record<string, string[]>);
                    const groupedWithCount = Object.entries(grouped).map(([gn, opts]) => {
                      const counts = opts.reduce((countAcc, opt) => {
                        if (opt) countAcc[opt] = (countAcc[opt] || 0) + 1;
                        return countAcc;
                      }, {} as Record<string, number>);
                      const formatted = Object.entries(counts).map(([name, count]) =>
                        count > 1 ? `${count}x ${name}` : name
                      );
                      return [gn, formatted] as [string, string[]];
                    });
                    return (
                      <div key={item.id} className="receipt-58mm-item-block">
                        <div className="receipt-58mm-item">
                          <span className="receipt-58mm-item-name">{item.quantity}x {item.product_name}</span>
                          <span className="receipt-58mm-item-value">{formatCurrency(Number(item.subtotal))}</span>
                        </div>
                        {groupedWithCount.map(([gn, opts]) => (
                          <div key={gn} className="receipt-58mm-item-opt">{gn}: {opts.join(', ')}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="receipt-58mm-sep" />
                <div className="receipt-58mm-section">
                  <div className="receipt-58mm-total-row">
                    <span className="receipt-58mm-total-label">Subtotal</span>
                    <span className="receipt-58mm-total-value">{formatCurrency(Number(order.subtotal))}</span>
                  </div>
                  {order.coupon_code && Number(order.discount_value) > 0 && (
                    <div className="receipt-58mm-total-row">
                      <span className="receipt-58mm-total-label">Cupom {order.coupon_code}</span>
                      <span className="receipt-58mm-total-value">-{formatCurrency(Number(order.discount_value))}</span>
                    </div>
                  )}
                  <div className="receipt-58mm-total-row">
                    <span className="receipt-58mm-total-label">Entrega</span>
                    <span className="receipt-58mm-total-value">{Number(order.delivery_fee) === 0 ? 'Gratis' : formatCurrency(Number(order.delivery_fee))}</span>
                  </div>
                  <div className="receipt-58mm-total-row receipt-58mm-grand">
                    <span className="receipt-58mm-total-label">TOTAL</span>
                    <span className="receipt-58mm-total-value">{formatCurrency(Number(order.total))}</span>
                  </div>
                </div>
                <div className="receipt-58mm-sep" />
                <div className="receipt-58mm-section">
                  <div className="receipt-58mm-line">Pgto: {PAYMENT_METHODS[order.payment_method as keyof typeof PAYMENT_METHODS] || order.payment_method}</div>
                  {order.needs_change && <div className="receipt-58mm-line">Troco p/ {order.change_amount ? formatCurrency(Number(order.change_amount)) : '-'}</div>}
                  {order.preorder_date && <div className="receipt-58mm-line receipt-58mm-strong">Encomenda: {order.preorder_date.split('-').reverse().join('/')}</div>}
                </div>
                <div className="receipt-58mm-footer">--- Obrigado pela preferencia! ---</div>
              </div>

              {/* Thermal print layout - only visible on print */}
              <div className="hidden print-only thermal-receipt" data-print-receipt="true">
                <div className="text-center font-bold text-base mb-2">{storeName}</div>
                <div className="text-center text-xs mb-1">Pedido #{order.order_number}</div>
                <div className="text-center text-xs mb-2">{formatDate(order.created_at)}</div>
                <div className="border-t border-dashed my-2" />

                <div className="text-xs"><strong>{order.customer_name}</strong></div>
                <div className="text-xs">{formatPhone(order.customer_phone)}</div>

                {order.address === 'Retirada no balcão' ? (
                  <div className="text-xs font-bold mt-1">RETIRADA NO BALCAO</div>
                ) : (
                  <>
                    <div className="text-xs mt-1">End: {order.address}, {order.address_number}</div>
                    {order.complement && <div className="text-xs">{order.complement}</div>}
                    {order.neighborhood_name && <div className="text-xs">{order.neighborhood_name}</div>}
                  </>
                )}

                <div className="border-t border-dashed my-2" />
{orderItems.map(item => {
                  const itemSels = orderItemSelections.filter(s => s.order_item_id === item.id);
                  const grouped = itemSels.reduce((acc, s) => {
                    const gn = s.group_name_snapshot || 'Opções';
                    if (!acc[gn]) acc[gn] = [];
                    acc[gn].push(s.option_name_snapshot || '');
                    return acc;
                  }, {} as Record<string, string[]>);
                  // Agrupa itens iguais para melhor leitura
                  const groupedWithCount = Object.entries(grouped).map(([gn, opts]) => {
                    const counts = opts.reduce((countAcc, opt) => {
                      if (opt) countAcc[opt] = (countAcc[opt] || 0) + 1;
                      return countAcc;
                    }, {} as Record<string, number>);
                    const formatted = Object.entries(counts).map(([name, count]) =>
                      count > 1 ? `${count}x ${name}` : name
                    );
                    return [gn, formatted] as [string, string[]];
                  });
                  return (
                    <div key={item.id} className="receipt-item mb-1">
                      <div className="receipt-row receipt-item-row flex justify-between text-xs">
                        <span className="receipt-item-name">{item.quantity}x {item.product_name}</span>
                        <span className="receipt-item-price">{formatCurrency(Number(item.subtotal))}</span>
                      </div>
                      {groupedWithCount.map(([gn, opts]) => (
                        <div key={gn} className="receipt-item-options text-[10px] ml-2">{gn}: {opts.join(', ')}</div>
                      ))}
                    </div>
                  );
                })}
                <div className="border-t border-dashed my-2" />
                <div className="receipt-row receipt-total-row flex justify-between text-xs"><span className="receipt-total-label">Subtotal</span><span className="receipt-total-value">{formatCurrency(Number(order.subtotal))}</span></div>
                {order.coupon_code && Number(order.discount_value) > 0 && (
                  <div className="receipt-row receipt-total-row flex justify-between text-xs"><span className="receipt-total-label">Cupom {order.coupon_code}</span><span className="receipt-total-value">-{formatCurrency(Number(order.discount_value))}</span></div>
                )}
                <div className="receipt-row receipt-total-row flex justify-between text-xs"><span className="receipt-total-label">Entrega</span><span className="receipt-total-value">{Number(order.delivery_fee) === 0 ? 'Grátis' : formatCurrency(Number(order.delivery_fee))}</span></div>
                <div className="receipt-row receipt-total-row receipt-grand-total flex justify-between text-sm font-bold mt-1"><span className="receipt-total-label">TOTAL</span><span className="receipt-total-value">{formatCurrency(Number(order.total))}</span></div>
                <div className="border-t border-dashed my-2" />
                <div className="text-xs">Pgto: {PAYMENT_METHODS[order.payment_method as keyof typeof PAYMENT_METHODS] || order.payment_method}</div>
                {order.needs_change && <div className="text-xs">Troco p/ {order.change_amount ? formatCurrency(Number(order.change_amount)) : '-'}</div>}
                {order.preorder_date && <div className="text-xs font-bold mt-1">Encomenda: {order.preorder_date.split('-').reverse().join('/')}</div>}
                <div className="text-center text-[10px] mt-3">--- Obrigado pela preferência! ---</div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SalesReport open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}