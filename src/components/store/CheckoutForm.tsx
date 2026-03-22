import { useState, Component, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/lib/cart';
import { useSettings } from '@/hooks/useSettings';
import { useStoreOpen } from '@/hooks/useStoreOpen';
import { formatCurrency } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, CheckCircle2, Loader2, Bug, Clock, MessageCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Error Boundary to prevent white screen
class CheckoutErrorBoundary extends Component<{ children: ReactNode; onBack: () => void }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; onBack: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('[CheckoutErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container mx-auto px-4 py-12 max-w-lg text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <h2 className="text-xl font-bold mb-2">Ocorreu um erro no checkout</h2>
          <p className="text-muted-foreground mb-6">Por favor, tente novamente.</p>
          <Button onClick={this.props.onBack} variant="outline" className="rounded-xl">Voltar ao cardápio</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CheckoutFormProps {
  onBack: () => void;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

/** Safe number parse — never returns NaN */
function safeNum(val: unknown, fallback = 0): number {
  if (val == null) return fallback;
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function CheckoutFormInner({ onBack }: CheckoutFormProps) {
  const { items, subtotal, clearCart, hasPreorderItems } = useCart();
  const { data: settings } = useSettings();
  const freeDelivery = settings?.free_delivery === 'true';
  const allowPickup = settings?.allow_pickup === 'true';
  const pickupOnly = settings?.pickup_only === 'true';
  const minOrderEnabled = settings?.min_order_enabled === 'true';
  const minOrderValue = safeNum(settings?.min_order_value);
  const { isOpen: storeIsOpen, todayLabel } = useStoreOpen();
  const allPreorder = items.length > 0 && items.every(i => i.is_preorder);
  const canCheckout = storeIsOpen || allPreorder;

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; type: string; value: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Check if any active coupons exist
  const { data: hasActiveCoupons } = useQuery({
    queryKey: ['active-coupons-exist'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('discount_coupons' as any).select('id').eq('is_active', true).limit(1);
        if (error) return false;
        return Array.isArray(data) && data.length > 0;
      } catch {
        return false;
      }
    },
  });

  const { data: neighborhoods = [] } = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('neighborhoods').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !freeDelivery,
  });

  const [form, setForm] = useState({
    delivery_mode: 'delivery',
    customer_name: '',
    customer_phone: '',
    address: '',
    address_number: '',
    complement: '',
    neighborhood_id: '',
    payment_method: '',
    needs_change: false,
    change_amount: '',
    preorder_date: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ orderNumber: number; orderPayload: any; sentItems: any[] } | null>(null);
  const [debugPayload, setDebugPayload] = useState<any>(null);
  const [debugError, setDebugError] = useState<any>(null);

  const isPickup = pickupOnly || (allowPickup && form.delivery_mode === 'pickup');
  const isDelivery = !isPickup;

  const selectedNeighborhood = Array.isArray(neighborhoods)
    ? neighborhoods.find(n => n.id === form.neighborhood_id)
    : undefined;
  const deliveryFee = isPickup || freeDelivery ? 0 : safeNum(selectedNeighborhood?.delivery_fee);

  const availablePaymentMethods = [
    { value: 'pix', label: 'Pix', key: 'payment_pix' },
    { value: 'cash', label: 'Dinheiro', key: 'payment_cash' },
    { value: 'credit', label: 'Cartão de Crédito', key: 'payment_credit' },
    { value: 'debit', label: 'Cartão de Débito', key: 'payment_debit' },
  ].filter(method => !settings || settings[method.key] !== 'false');

  const normalizedPaymentMethod = typeof form.payment_method === 'string' ? form.payment_method.trim() : '';
  const hasValidPaymentMethod = availablePaymentMethods.some(method => method.value === normalizedPaymentMethod);

  // Coupon discount calculation
  const discountValue = appliedCoupon
    ? appliedCoupon.type === 'percentage'
      ? Math.round((safeNum(subtotal) * (safeNum(appliedCoupon.value) / 100)) * 100) / 100
      : safeNum(appliedCoupon.value)
    : 0;
  const total = Math.max(0, safeNum(subtotal) + safeNum(deliveryFee) - safeNum(discountValue));

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const { data, error } = await supabase
        .from('discount_coupons' as any)
        .select('*')
        .eq('code', couponCode.trim().toUpperCase())
        .eq('is_active', true)
        .limit(1);
      if (error) throw error;
      const coupons = Array.isArray(data) ? data : [];
      if (!coupons.length) { setCouponError('Cupom não encontrado ou inativo'); setCouponLoading(false); return; }
      const coupon = coupons[0] as any;
      if (coupon.min_order_value && subtotal < coupon.min_order_value) {
        setCouponError(`Pedido mínimo de ${formatCurrency(coupon.min_order_value)} para este cupom`);
        setCouponLoading(false);
        return;
      }
      setAppliedCoupon({ code: String(coupon.code || ''), type: String(coupon.type || 'fixed'), value: safeNum(coupon.value) });
      setCouponError('');
    } catch {
      setCouponError('Erro ao validar cupom');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  /** Safe setter — ensures only valid string/boolean values enter state */
  const set = (key: string, value: unknown) => {
    try {
      setForm(prev => ({ ...prev, [key]: value ?? '' }));
    } catch (err) {
      console.error('[CheckoutForm] Error setting form field:', key, err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!items.length) return;

    // Validate delivery_mode
    if (allowPickup && !pickupOnly && !form.delivery_mode) {
      toast({ title: 'Escolha obrigatória', description: 'Selecione Entrega ou Retirada no balcão.', variant: 'destructive' });
      return;
    }

    // Validate minimum order (only for delivery)
    if (minOrderEnabled && isDelivery && subtotal < minOrderValue) {
      toast({ title: 'Pedido mínimo', description: `Nosso pedido mínimo é de ${formatCurrency(minOrderValue)}`, variant: 'destructive' });
      return;
    }

    // Validate phone
    if (!isValidPhone(form.customer_phone)) {
      toast({ title: 'Telefone inválido', description: 'Informe um telefone válido.', variant: 'destructive' });
      return;
    }

    // Validate neighborhood for delivery (non-free)
    if (isDelivery && !freeDelivery && !form.neighborhood_id) {
      toast({ title: 'Bairro obrigatório', description: 'Selecione um bairro para entrega.', variant: 'destructive' });
      return;
    }

    if (hasPreorderItems && !form.preorder_date) {
      toast({ title: 'Data obrigatória', description: 'Selecione uma data para itens de encomenda', variant: 'destructive' });
      return;
    }

    if (!hasValidPaymentMethod) {
      toast({ title: 'Pagamento obrigatório', description: 'Selecione uma forma de pagamento para continuar.', variant: 'destructive' });
      return;
    }

    if (hasPreorderItems && form.preorder_date) {
      const preorderItems = items.filter(i => i.is_preorder && i.preorder_days);
      const maxDays = preorderItems.length > 0 ? Math.max(...preorderItems.map(i => i.preorder_days || 0)) : 0;
      const selected = new Date(form.preorder_date + 'T00:00:00');
      const today = new Date();
      const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDays);
      if (selected < minDate) {
        toast({ title: 'Data inválida', description: `A data mínima é ${maxDays} dia(s) a partir de hoje`, variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    
    let orderPayload: any = null;
    
    try {
      orderPayload = {
        customer_name: String(form.customer_name || '').trim(),
        customer_phone: String(form.customer_phone || '').trim(),
        address: isPickup ? 'Retirada no balcão' : String(form.address || '').trim(),
        address_number: isPickup ? '-' : String(form.address_number || '').trim(),
        complement: isPickup ? null : (String(form.complement || '').trim() || null),
        neighborhood_id: isPickup || freeDelivery ? null : (form.neighborhood_id || null),
        neighborhood_name: isPickup || freeDelivery ? null : (selectedNeighborhood?.name || null),
        delivery_fee: safeNum(deliveryFee),
        subtotal: safeNum(subtotal),
        total: safeNum(total),
        payment_method: String(form.payment_method || ''),
        needs_change: Boolean(form.needs_change),
        change_amount: form.needs_change && form.change_amount ? safeNum(form.change_amount) : null,
        preorder_date: form.preorder_date || null,
        coupon_code: appliedCoupon?.code || null,
        discount_value: safeNum(discountValue),
      };

      console.log('🔍 === DEBUG: INSERT em orders ===');
      console.log('📦 Objeto completo:', orderPayload);
      console.log('🔍 ================================');

      const { data: created, error: createErr } = await supabase.functions.invoke('create-order', {
        body: {
          order: orderPayload,
          items,
        },
      });

      if (createErr) throw createErr;
      if ((created as any)?.error) throw new Error((created as any).error);

      const orderNumber = (created as any)?.order?.order_number;
      setSuccessData({ orderNumber, orderPayload, sentItems: [...items] });
      clearCart();
      setSuccess(true);
    } catch (err: any) {
      setDebugError({
        error: {
          message: err.message || 'Erro desconhecido',
          details: err.details || null,
          hint: err.hint || null,
          code: err.code || null,
          stack: err.stack || null,
        },
        payload: orderPayload,
      });
      toast({ title: 'Erro ao enviar pedido', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappOrderEnabled = settings?.whatsapp_order_enabled === 'true';
  const storeWhatsapp = settings?.whatsapp || '';

  if (success) {
    const buildWhatsAppUrl = () => {
      if (!successData || !storeWhatsapp) return '';
      const phone = storeWhatsapp.replace(/\D/g, '');
      const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
      const { orderNumber, orderPayload, sentItems } = successData;

      const PAYMENT_LABELS: Record<string, string> = { pix: 'Pix', cash: 'Dinheiro', credit: 'Cartão de Crédito', debit: 'Cartão de Débito' };
      const isPickupOrder = orderPayload.address === 'Retirada no balcão';

      let itemsText = '';
      for (const item of sentItems) {
        const sels = item.selections || [];
        const comboSels = sels.filter((s: any) => s.group_name === 'Itens do Combo');
        const flavorSels = sels.filter((s: any) => s.group_name === 'Sabores');
        const crustSels = sels.filter((s: any) => s.group_name === 'Borda Recheada' || s.group_name === 'Borda');
        const otherSels = sels.filter((s: any) => !comboSels.includes(s) && !flavorSels.includes(s) && !crustSels.includes(s));

        itemsText += `${item.quantity}x ${item.name} - ${formatCurrency(item.price * item.quantity)}\n`;

        if (comboSels.length > 0) {
          const grouped: Record<string, number> = {};
          comboSels.forEach((s: any) => { grouped[s.option_name] = (grouped[s.option_name] || 0) + 1; });
          Object.entries(grouped).forEach(([name, qty]) => { itemsText += `  ${qty}x ${name}\n`; });
        }
        if (flavorSels.length > 0) {
          itemsText += `  Sabores: ${flavorSels.map((s: any) => s.option_name).join(' / ')}\n`;
        }
        if (crustSels.length > 0) {
          itemsText += `  Borda recheada: ${crustSels.map((s: any) => s.option_name).join(', ')}\n`;
        }
        if (otherSels.length > 0) {
          otherSels.forEach((s: any) => { itemsText += `  ${s.group_name}: ${s.option_name}${s.price > 0 ? ` (+${formatCurrency(s.price)})` : ''}\n`; });
        }
      }

      const lines = [
        `🛒 *NOVO PEDIDO NO CARDÁPIO DIGITAL*`,
        ``,
        `Pedido: #${orderNumber || '---'}`,
        `Cliente: ${orderPayload.customer_name}`,
        `Telefone: ${orderPayload.customer_phone}`,
        ``,
        `Tipo: ${isPickupOrder ? 'Retirada no balcão' : 'Entrega'}`,
      ];
      if (!isPickupOrder) {
        let addr = orderPayload.address;
        if (orderPayload.address_number) addr += `, ${orderPayload.address_number}`;
        if (orderPayload.complement) addr += ` - ${orderPayload.complement}`;
        if (orderPayload.neighborhood_name) addr += ` (${orderPayload.neighborhood_name})`;
        lines.push(`Endereço: ${addr}`);
      }
      lines.push(``);
      lines.push(`Pagamento: ${PAYMENT_LABELS[orderPayload.payment_method] || orderPayload.payment_method}`);
      if (orderPayload.needs_change && orderPayload.change_amount) {
        lines.push(`Troco para: ${formatCurrency(orderPayload.change_amount)}`);
      }
      lines.push(``);
      lines.push(`*Itens:*`);
      lines.push(itemsText.trim());
      lines.push(``);
      lines.push(`Subtotal: ${formatCurrency(orderPayload.subtotal)}`);
      if (orderPayload.discount_value > 0) {
        lines.push(`Desconto (${orderPayload.coupon_code}): -${formatCurrency(orderPayload.discount_value)}`);
      }
      lines.push(`Entrega: ${isPickupOrder ? 'Retirada' : orderPayload.delivery_fee === 0 ? 'Grátis' : formatCurrency(orderPayload.delivery_fee)}`);
      lines.push(`*Total: ${formatCurrency(orderPayload.total)}*`);

      const msg = encodeURIComponent(lines.join('\n'));
      return `https://wa.me/${fullPhone}?text=${msg}`;
    };

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in">
        <CheckCircle2 className="h-20 w-20 text-success mb-4" />
        <h2 className="text-2xl font-extrabold mb-2">Pedido Registrado!</h2>
        {whatsappOrderEnabled && storeWhatsapp ? (
          <>
            <p className="text-muted-foreground mb-2">Seu pedido foi registrado com sucesso.</p>
            <p className="text-sm font-semibold text-foreground mb-1">Para concluir o atendimento, é obrigatório enviar o pedido no WhatsApp da loja.</p>
            <p className="text-xs text-muted-foreground mb-5">Clique no botão abaixo para enviar.</p>
            <a href={buildWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="mb-4 w-full max-w-xs">
              <Button type="button" className="w-full rounded-xl h-11 font-bold gap-2 bg-[#25D366] hover:bg-[#1da851] text-white">
                <MessageCircle className="h-5 w-5" /> Enviar pedido no WhatsApp
              </Button>
            </a>
          </>
        ) : (
          <p className="text-muted-foreground mb-6">Seu pedido foi recebido com sucesso. Em breve entraremos em contato.</p>
        )}
        <Button onClick={onBack} variant="outline" className="rounded-xl">Fazer novo pedido</Button>
      </div>
    );
  }

  return (
    <>
      {/* Modal de Debug - Payload */}
      <Dialog open={!!debugPayload} onOpenChange={(open) => !open && setDebugPayload(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Bug className="h-5 w-5 text-warning" />
              DEBUG: Payload do Pedido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Este é o objeto que será enviado para a tabela <code className="bg-accent text-accent-foreground px-1 rounded">orders</code>:
            </p>
            <pre className="bg-muted text-foreground p-4 rounded-lg overflow-auto text-xs whitespace-pre-wrap">
              {JSON.stringify(debugPayload, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button onClick={() => setDebugPayload(null)} variant="outline" className="flex-1">
                Fechar
              </Button>
              <Button 
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(debugPayload, null, 2));
                  toast({ title: 'Copiado!', description: 'Payload copiado para área de transferência' });
                }}
                variant="secondary"
                className="flex-1"
              >
                Copiar JSON
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Debug - Erro */}
      <Dialog open={!!debugError} onOpenChange={(open) => !open && setDebugError(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto bg-card text-card-foreground border-2 border-destructive shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-xl">
              <Bug className="h-6 w-6" />
              🔴 ERRO AO INSERIR PEDIDO NA TABELA ORDERS
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <Alert variant="destructive" className="border-2">
              <AlertTitle className="text-lg font-bold">Falha no INSERT</AlertTitle>
              <AlertDescription className="text-base">
                O Supabase retornou um erro ao tentar inserir o pedido na tabela <code className="bg-destructive/20 px-2 py-1 rounded font-mono">orders</code>
              </AlertDescription>
            </Alert>

            <div className="space-y-4 bg-destructive/5 p-4 rounded-lg border border-destructive/20">
              <h3 className="font-bold text-lg text-destructive">📋 Detalhes do Erro:</h3>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-bold text-foreground">1. error.message:</Label>
                  <div className="bg-muted text-foreground p-3 rounded-lg mt-1 border border-border font-mono text-sm">
                    {debugError?.error?.message || 'N/A'}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-bold text-foreground">2. error.details:</Label>
                  <div className="bg-muted text-foreground p-3 rounded-lg mt-1 border border-border font-mono text-sm">
                    {debugError?.error?.details || 'N/A'}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-bold text-foreground">3. error.hint:</Label>
                  <div className="bg-muted text-foreground p-3 rounded-lg mt-1 border border-border font-mono text-sm">
                    {debugError?.error?.hint || 'N/A'}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-bold text-foreground">4. error.code:</Label>
                  <div className="bg-muted text-foreground p-3 rounded-lg mt-1 border border-border font-mono text-sm">
                    {debugError?.error?.code || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-destructive">6. Objeto Completo do Erro (JSON):</Label>
              <pre className="bg-destructive/10 text-foreground p-4 rounded-lg overflow-auto text-xs font-mono border-2 border-destructive/30 whitespace-pre-wrap max-h-60">
                {debugError && JSON.stringify(debugError.error, null, 2)}
              </pre>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-primary">1. Payload Enviado para orders (JSON):</Label>
              <pre className="bg-primary/5 text-foreground p-4 rounded-lg overflow-auto text-xs font-mono border border-primary/30 whitespace-pre-wrap max-h-60">
                {debugError && JSON.stringify(debugError.payload, null, 2)}
              </pre>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={() => setDebugError(null)} variant="outline" className="flex-1">
                Fechar
              </Button>
              <Button 
                onClick={() => {
                  const debugText = `🔴 ERRO AO INSERIR PEDIDO
=================================

1. PAYLOAD ENVIADO:
${JSON.stringify(debugError?.payload, null, 2)}

2. error.message:
${debugError?.error?.message || 'N/A'}

3. error.details:
${debugError?.error?.details || 'N/A'}

4. error.hint:
${debugError?.error?.hint || 'N/A'}

5. error.code:
${debugError?.error?.code || 'N/A'}

6. OBJETO COMPLETO DO ERRO:
${JSON.stringify(debugError?.error, null, 2)}`;
                  
                  navigator.clipboard.writeText(debugText);
                  toast({ title: '✅ Copiado!', description: 'Debug completo copiado para área de transferência' });
                }}
                variant="secondary"
                className="flex-1"
              >
                📋 Copiar Debug Completo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 py-6 max-w-lg animate-slide-up">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar ao cardápio
        </button>
        <h2 className="text-xl font-extrabold mb-6">Finalizar Pedido</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Delivery mode */}
        {pickupOnly ? (
          <div className="bg-accent/50 rounded-xl p-4">
            <p className="text-sm font-bold">📦 Apenas retirada no balcão</p>
          </div>
        ) : allowPickup ? (
          <div className="bg-accent/50 rounded-xl p-4 space-y-3">
            <Label className="font-bold">Como deseja receber? *</Label>
            <RadioGroup value={form.delivery_mode} onValueChange={v => set('delivery_mode', v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="delivery" id="mode-delivery" />
                <Label htmlFor="mode-delivery" className="cursor-pointer">Entrega</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pickup" id="mode-pickup" />
                <Label htmlFor="mode-pickup" className="cursor-pointer">Retirada no balcão</Label>
              </div>
            </RadioGroup>
          </div>
        ) : null}

        {/* 2. Name */}
        <div>
          <Label htmlFor="name">Nome completo *</Label>
          <Input id="name" required value={form.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="Seu nome" className="rounded-xl" />
        </div>

        {/* 3. Phone with mask */}
        <div>
          <Label htmlFor="phone">Telefone *</Label>
          <Input
            id="phone"
            required
            value={form.customer_phone}
            onChange={e => set('customer_phone', formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            className="rounded-xl"
            maxLength={16}
          />
        </div>

        {/* 4. Address fields — only for delivery */}
        {isDelivery && (
          <>
            {!freeDelivery && neighborhoods.length > 0 && (
              <div>
                <Label>Bairro *</Label>
                <Select
                  {...(form.neighborhood_id ? { value: form.neighborhood_id } : {})}
                  onValueChange={v => {
                    if (typeof v === 'string' && v) {
                      set('neighborhood_id', v);
                    }
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecione o bairro" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(neighborhoods) && neighborhoods.map(n => n && n.id ? (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name || 'Sem nome'} — {formatCurrency(safeNum(n.delivery_fee))}
                      </SelectItem>
                    ) : null)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="address">Endereço *</Label>
              <Input id="address" required value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, Avenida..." className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="number">Número *</Label>
                <Input id="number" required value={form.address_number} onChange={e => set('address_number', e.target.value)} placeholder="Nº" className="rounded-xl" />
              </div>
              <div>
                <Label htmlFor="complement">Complemento</Label>
                <Input id="complement" value={form.complement} onChange={e => set('complement', e.target.value)} placeholder="Apto, Bloco..." className="rounded-xl" />
              </div>
            </div>
          </>
        )}

        {/* Payment */}
        <div>
          <Label>Forma de pagamento *</Label>
          <Select
            {...(form.payment_method ? { value: form.payment_method } : {})}
            onValueChange={v => {
              if (typeof v === 'string' && v) {
                set('payment_method', v);
              }
            }}
          >
            <SelectTrigger className="rounded-xl" aria-invalid={!hasValidPaymentMethod && submitting}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {availablePaymentMethods.map(method => (
                <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasValidPaymentMethod && (
            <p className="mt-2 text-sm font-medium text-destructive">Selecione uma forma de pagamento para continuar.</p>
          )}
        </div>

        {form.payment_method === 'cash' && (
          <div className="space-y-3 bg-accent/50 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="needs-change" className="cursor-pointer">Precisa de troco?</Label>
              <Switch id="needs-change" checked={form.needs_change} onCheckedChange={v => set('needs_change', v)} />
            </div>
            {form.needs_change && (
              <div>
                <Label htmlFor="change">Troco para quanto?</Label>
                <Input id="change" type="number" step="0.01" min="0" value={form.change_amount} onChange={e => set('change_amount', e.target.value)} placeholder="R$ 0,00" className="rounded-xl" />
              </div>
            )}
          </div>
        )}

        {hasPreorderItems && (() => {
          try {
            const preorderItems = items.filter(i => i.is_preorder && i.preorder_days);
            const maxDays = preorderItems.length > 0 ? Math.max(...preorderItems.map(i => i.preorder_days || 0)) : 1;
            const today = new Date();
            const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDays);
            const minStr = minDate.toISOString().split('T')[0];
            return (
              <div className="bg-warning/10 rounded-xl p-3">
                <Label htmlFor="preorder-date">Data de entrega (encomenda) *</Label>
                <Input id="preorder-date" type="date" required min={minStr} value={form.preorder_date} onChange={e => set('preorder_date', e.target.value)} className="rounded-xl mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Data mínima: {minDate.toLocaleDateString('pt-BR')}</p>
              </div>
            );
          } catch {
            return null;
          }
        })()}

        {/* Coupon field — only if active coupons exist */}
        {hasActiveCoupons && (
          <div className="bg-accent/50 rounded-xl p-3 space-y-2">
            <Label>Cupom de desconto</Label>
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-primary/10 rounded-lg p-2">
                <span className="text-sm font-bold text-primary">
                  {appliedCoupon.code} — {appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}%` : formatCurrency(appliedCoupon.value)} de desconto
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={handleRemoveCoupon} className="text-xs text-destructive h-7">Remover</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="CÓDIGO"
                  className="rounded-xl font-mono flex-1"
                />
                <Button type="button" variant="secondary" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()} className="rounded-xl">
                  {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                </Button>
              </div>
            )}
            {couponError && <p className="text-xs text-destructive">{couponError}</p>}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(safeNum(subtotal))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Taxa de entrega</span>
            <span>{isPickup ? 'Retirada' : freeDelivery ? 'Grátis' : formatCurrency(safeNum(deliveryFee))}</span>
          </div>
          {discountValue > 0 && (
            <div className="flex justify-between text-sm text-primary">
              <span>Desconto ({appliedCoupon?.code})</span>
              <span>-{formatCurrency(safeNum(discountValue))}</span>
            </div>
          )}
          <div className="flex justify-between font-extrabold text-lg pt-2 border-t border-border">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(safeNum(total))}</span>
          </div>
        </div>

        {!canCheckout && (
          <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4">
            <Clock className="h-5 w-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-destructive">Estamos fechados no momento</p>
              <p className="text-xs text-muted-foreground">{todayLabel}. Não é possível finalizar pedidos agora.</p>
            </div>
          </div>
        )}

        {minOrderEnabled && isDelivery && subtotal < minOrderValue && (
          <div className="flex items-center gap-3 bg-warning/10 border border-warning/30 rounded-xl p-4">
            <span className="text-sm text-warning font-medium">Nosso pedido mínimo é de {formatCurrency(minOrderValue)}</span>
          </div>
        )}

        <Button type="submit" disabled={submitting || !items.length || !canCheckout || !hasValidPaymentMethod || (minOrderEnabled && isDelivery && subtotal < minOrderValue)} className="w-full h-12 rounded-xl font-bold text-base">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : !canCheckout ? 'Loja Fechada' : 'Enviar Pedido'}
        </Button>
      </form>
      </div>
    </>
  );
}

export function CheckoutForm({ onBack }: CheckoutFormProps) {
  return (
    <CheckoutErrorBoundary onBack={onBack}>
      <CheckoutFormInner onBack={onBack} />
    </CheckoutErrorBoundary>
  );
}
