import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, formatPhone, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Printer, Eye, Trash2, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useSettings } from '@/hooks/useSettings';
import { buildAdminWhatsAppMessage } from '@/lib/adminWhatsAppMessage';
const ITEMS_PER_PAGE = 7;

interface AdminOrdersProps {
  onOrderViewed?: (orderId: string) => void;
}

export function AdminOrders({ onOrderViewed }: AdminOrdersProps) {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data: settings } = useSettings();
  const storeName = settings?.business_name || 'Meu Estabelecimento';

  const { data: orders = [] } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as (typeof data[number] & { opened_at: string | null })[];
    },
  });

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

  const totalPages = Math.ceil(orders.length / ITEMS_PER_PAGE);
  const paginatedOrders = orders.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  // Reset page if it goes out of bounds
  if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));

  const handlePrint = () => {
    const is58 = settings?.printer_paper_width === '58mm';
    const body = document.body;
    const had = body.classList.contains('printer-58mm');
    if (is58) body.classList.add('printer-58mm');
    else body.classList.remove('printer-58mm');

    const cleanup = () => {
      if (!had) body.classList.remove('printer-58mm');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    // Give the browser a tick to apply the class before opening the print dialog
    setTimeout(() => window.print(), 50);
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

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6">Pedidos</h1>
      {orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Nenhum pedido ainda</p>
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
                      {(() => { const ps = PAYMENT_STATUSES[(o as any).payment_status as keyof typeof PAYMENT_STATUSES] || PAYMENT_STATUSES.pending; return <Badge className={cn('text-[10px]', ps.color)}>Pgto: {ps.label}</Badge>; })()}
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
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setSelectedOrder(o.id); onOrderViewed?.(o.id); }}>
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
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => (
                <Button
                  key={i}
                  variant={page === i ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0 text-xs"
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </Button>
              ))}
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
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
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="text-muted-foreground">Status pgto:</span>
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
                        {groupedWithCount.map(([gn, opts]) => (
                          <p key={gn} className="text-xs text-muted-foreground ml-4">{gn}: {opts.join(', ')}</p>
                        ))}
                      </div>
                    );
                  })}
                </div>

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
    </div>
  );
}