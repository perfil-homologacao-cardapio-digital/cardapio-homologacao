import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useSettings } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';

type RangeKey = 'today' | '7d' | '30d' | 'custom';

interface SalesReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function SalesReport({ open, onOpenChange }: SalesReportProps) {
  const { data: settings } = useSettings();
  const storeName = settings?.business_name || 'Meu Estabelecimento';
  const automationEnabled = settings?.payment_automation_enabled === 'true';

  const [range, setRange] = useState<RangeKey>('today');
  const today = new Date();
  const [customStart, setCustomStart] = useState<string>(toLocalDateInput(today));
  const [customEnd, setCustomEnd] = useState<string>(toLocalDateInput(today));

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (range === 'today') {
      return { startDate: startOfLocalDay(now), endDate: endOfLocalDay(now) };
    }
    if (range === '7d') {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { startDate: startOfLocalDay(s), endDate: endOfLocalDay(now) };
    }
    if (range === '30d') {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { startDate: startOfLocalDay(s), endDate: endOfLocalDay(now) };
    }
    // custom
    const s = customStart ? new Date(customStart + 'T00:00:00') : startOfLocalDay(now);
    const e = customEnd ? new Date(customEnd + 'T23:59:59') : endOfLocalDay(now);
    return { startDate: s, endDate: e };
  }, [range, customStart, customEnd]);

  const periodLabel = useMemo(() => {
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    if (range === 'today') return `Hoje (${fmt(startDate)})`;
    if (range === '7d') return `Últimos 7 dias (${fmt(startDate)} a ${fmt(endDate)})`;
    if (range === '30d') return `Últimos 30 dias (${fmt(startDate)} a ${fmt(endDate)})`;
    return `${fmt(startDate)} a ${fmt(endDate)}`;
  }, [range, startDate, endDate]);

  const { data: report, isLoading } = useQuery({
    queryKey: ['sales-report', startDate.toISOString(), endDate.toISOString(), automationEnabled],
    queryFn: async () => {
      // Fetch orders in range (exclude cancelled always)
      const { data: ordersRaw, error: oerr } = await supabase
        .from('orders')
        .select('id, total, status, payment_status, payment_method, created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      if (oerr) throw oerr;

      // Filter valid orders
      const valid = (ordersRaw || []).filter((o: any) => {
        if (o.status === 'cancelled') return false;
        if (automationEnabled) {
          // Automated payments: only paid orders count
          // Manual methods (cash) within an automated-enabled store still count if not cancelled
          const method = o.payment_method as string;
          if (method === 'pix' || method === 'credit' || method === 'debit') {
            return o.payment_status === 'paid';
          }
          return o.payment_status !== 'failed';
        }
        // Manual payment mode: count all non-failed orders
        return o.payment_status !== 'failed';
      });

      const validIds = valid.map(o => o.id);
      const totalRevenue = valid.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const totalOrders = valid.length;

      let products: { name: string; quantity: number; total: number }[] = [];
      if (validIds.length > 0) {
        const { data: items, error: ierr } = await supabase
          .from('order_items')
          .select('product_name, quantity, subtotal, order_id')
          .in('order_id', validIds);
        if (ierr) throw ierr;

        const map = new Map<string, { name: string; quantity: number; total: number }>();
        (items || []).forEach((it: any) => {
          const key = it.product_name;
          const cur = map.get(key) || { name: key, quantity: 0, total: 0 };
          cur.quantity += Number(it.quantity || 0);
          cur.total += Number(it.subtotal || 0);
          map.set(key, cur);
        });
        products = Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
      }

      const topProduct = products[0] || null;

      return { totalRevenue, totalOrders, products, topProduct };
    },
    enabled: open,
    staleTime: 0,
  });

  const handlePrint = () => {
    document.body.classList.add('printing-sales-report');
    const styleEl = document.createElement('style');
    styleEl.id = 'sales-report-page-style';
    styleEl.textContent = '@media print { @page { size: A4 portrait; margin: 12mm; } html, body { width: auto !important; } }';
    document.head.appendChild(styleEl);
    const cleanup = () => {
      document.body.classList.remove('printing-sales-report');
      document.getElementById('sales-report-page-style')?.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 50);
  };

  const rangeButtons: { key: RangeKey; label: string }[] = [
    { key: 'today', label: 'Hoje' },
    { key: '7d', label: 'Últimos 7 dias' },
    { key: '30d', label: 'Últimos 30 dias' },
    { key: 'custom', label: 'Personalizado' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-report-dialog max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatório de Vendas</DialogTitle>
        </DialogHeader>

        {/* Filters - hidden on print */}
        <div className="space-y-3 no-print">
          <div className="flex flex-wrap gap-2">
            {rangeButtons.map(b => (
              <Button
                key={b.key}
                variant={range === b.key ? 'default' : 'outline'}
                size="sm"
                className="rounded-lg"
                onClick={() => setRange(b.key)}
              >
                {b.label}
              </Button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Report content - visible on screen AND print */}
        <div className="sales-report-printable space-y-4">
          <div className="report-header text-center hidden">
            <h1 className="text-xl font-extrabold">{storeName}</h1>
            <p className="text-sm">Relatório de Vendas</p>
          </div>

          <div className="text-sm text-muted-foreground">
            <p><strong>Período:</strong> {periodLabel}</p>
            <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
            {automationEnabled && (
              <p className="text-xs mt-1 italic no-print">
                Modo pagamento automatizado: somente pedidos pagos (Pix/cartão) são contabilizados.
              </p>
            )}
          </div>

          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Total vendido</p>
                  <p className="text-2xl font-extrabold text-primary">{formatCurrency(report?.totalRevenue || 0)}</p>
                </div>
                <div className="border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Total de pedidos</p>
                  <p className="text-2xl font-extrabold">{report?.totalOrders || 0}</p>
                </div>
                <div className="border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground">Produto mais vendido</p>
                  <p className="text-lg font-bold truncate">
                    {report?.topProduct ? `${report.topProduct.name}` : '—'}
                  </p>
                  {report?.topProduct && (
                    <p className="text-xs text-muted-foreground">{report.topProduct.quantity} unidades</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-bold mb-2">Produtos vendidos</h3>
                {report?.products && report.products.length > 0 ? (
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-2">Produto</th>
                          <th className="text-right p-2">Qtd</th>
                          <th className="text-right p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.products.map((p, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{p.name}</td>
                            <td className="p-2 text-right">{p.quantity}</td>
                            <td className="p-2 text-right">{formatCurrency(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum pedido válido no período.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir relatório
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
