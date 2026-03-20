import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Package, CheckCircle2, ChefHat, Clock, Truck, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';

interface OrderTrackerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACTIVE_STATUSES = ['new', 'preparing', 'ready', 'out_for_delivery'];

const DELIVERY_STEPS = [
  { key: 'new', label: 'Recebido', icon: Clock },
  { key: 'preparing', label: 'Em preparo', icon: ChefHat },
  { key: 'ready', label: 'Pronto', icon: Package },
  { key: 'out_for_delivery', label: 'Saiu p/ entrega', icon: Truck },
  { key: 'delivered', label: 'Entregue', icon: CheckCircle2 },
];

const PICKUP_STEPS = [
  { key: 'new', label: 'Recebido', icon: Clock },
  { key: 'preparing', label: 'Em preparo', icon: ChefHat },
  { key: 'ready', label: 'Pronto p/ retirada', icon: Package },
  { key: 'delivered', label: 'Retirado', icon: MapPin },
];

interface FoundOrder {
  id: string;
  order_number: number;
  customer_name: string;
  status: string;
  address: string;
}

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function OrderTracker({ open, onOpenChange }: OrderTrackerProps) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [order, setOrder] = useState<FoundOrder | null>(null);

  const cleanPhone = phone.replace(/\D/g, '');
  const isValid = cleanPhone.length >= 10 && cleanPhone.length <= 11;

  const handleSearch = async () => {
    if (!isValid) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke('track-order', {
        body: { phone: cleanPhone },
      });
      if (error) throw error;
      setOrder(data?.order || null);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setPhone('');
      setSearched(false);
      setOrder(null);
    }
    onOpenChange(v);
  };

  const isPickup = order?.address === 'Retirada no balcão';
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
  // Map statuses that don't exist in the current step set to the nearest equivalent
  const resolvedStatus = (() => {
    if (!order) return '';
    const status = order.status;
    const existsInSteps = steps.some(s => s.key === status);
    if (existsInSteps) return status;
    // Pickup order with delivery-only status
    if (isPickup && status === 'out_for_delivery') return 'ready';
    // Delivery order with pickup-only status (unlikely but safe)
    return status;
  })();
  const currentIndex = order ? steps.findIndex(s => s.key === resolvedStatus) : -1;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">📦 Acompanhe seu pedido</DialogTitle>
        </DialogHeader>

        {/* Search form */}
        {!order && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Digite o telefone usado no pedido para verificar o status.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={e => setPhone(applyPhoneMask(e.target.value))}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={!isValid || loading} className="rounded-xl">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {searched && !loading && !order && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Não encontramos pedido em andamento para este telefone.
              </p>
            )}
          </div>
        )}

        {/* Order status display */}
        {order && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-lg font-bold">Olá, {order.customer_name} 👋</p>
              <p className="text-sm text-muted-foreground">
                Pedido #{order.order_number} • {isPickup ? 'Retirada no balcão' : 'Entrega'}
              </p>
            </div>

            {/* Status stepper */}
            <div className="flex items-start justify-between gap-1 px-2">
              {steps.map((step, i) => {
                const Icon = step.icon;
                const isDone = i < currentIndex;
                const isCurrent = i === currentIndex;
                const isFuture = i > currentIndex;

                return (
                  <div key={step.key} className="flex flex-col items-center flex-1 relative">
                    {/* Connector line */}
                    {i > 0 && (
                      <div className={cn(
                        "absolute top-4 -left-1/2 w-full h-0.5",
                        isDone || isCurrent ? "bg-emerald-500" : "bg-muted"
                      )} style={{ zIndex: 0 }} />
                    )}
                    {/* Circle */}
                    <div className={cn(
                      "relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all",
                      isDone && "bg-emerald-500 border-emerald-500 text-white",
                      isCurrent && "bg-primary border-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30",
                      isFuture && "bg-muted border-muted-foreground/20 text-muted-foreground"
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    {/* Label */}
                    <span className={cn(
                      "text-[10px] mt-1.5 text-center leading-tight font-medium",
                      isDone && "text-emerald-600",
                      isCurrent && "text-primary font-bold",
                      isFuture && "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setOrder(null); setSearched(false); }}>
                Buscar outro pedido
              </Button>
              <Button className="flex-1 rounded-xl" onClick={handleSearch}>
                Atualizar status
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}