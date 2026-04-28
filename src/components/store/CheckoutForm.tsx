import { useEffect, useMemo, useState, Component, ReactNode, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/lib/cart';
import { useSettings } from '@/hooks/useSettings';
import { useStoreOpen } from '@/hooks/useStoreOpen';
import { formatCurrency } from '@/lib/format';
import { getEffectiveAvailability, normalizeStockQuantity } from '@/lib/stock';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, CheckCircle2, Loader2, Bug, Clock, MessageCircle, Copy, Check, QrCode } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { generatePixPayload } from '@/lib/pixPayload';
import QRCode from 'qrcode';
import { PixAutoPaymentModal } from './PixAutoPaymentModal';
import { CardPaymentBrickModal } from './CardPaymentBrickModal';
import { CardSuccessModal } from './CardSuccessModal';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Pix payment block with EMV payload + QR Code */
function PixPaymentBlock({ pixKey, recipientName, recipientCity, total }: { pixKey: string; recipientName: string; recipientCity: string; total: number }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const pixPayload = useMemo(() => generatePixPayload({
    pixKey,
    recipientName,
    recipientCity,
    amount: total,
  }), [pixKey, recipientName, recipientCity, total]);

  useEffect(() => {
    if (showQr && pixPayload) {
      QRCode.toDataURL(pixPayload, { width: 256, margin: 2 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(''));
    }
  }, [showQr, pixPayload]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    toast({ title: 'Código Pix copiado!' });
    setTimeout(() => setCopied(false), 3000);
  }, [pixPayload]);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-foreground">Pague via Pix</p>
        <p className="text-xs text-muted-foreground">
          Copie o código Pix abaixo, faça o pagamento no app do seu banco e depois envie o comprovante pelo WhatsApp junto com seu pedido.
        </p>
      </div>

      <div className="bg-accent/50 rounded-lg px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">Valor</p>
        <p className="text-2xl font-extrabold text-primary">{formatCurrency(total)}</p>
      </div>

      <Button type="button" className="w-full rounded-xl h-11 font-bold gap-2" onClick={handleCopy}>
        {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        {copied ? 'Código copiado!' : 'Copiar código Pix'}
      </Button>

      <p className="text-xs text-muted-foreground text-center break-all">
        Chave Pix: <span className="font-mono text-foreground">{pixKey}</span>
      </p>

      <button
        type="button"
        className="w-full text-center text-xs text-primary hover:underline flex items-center justify-center gap-1"
        onClick={() => setShowQr(prev => !prev)}
      >
        <QrCode className="h-3.5 w-3.5" />
        {showQr ? 'Ocultar QR Code' : 'Exibir QR Code'}
      </button>

      {showQr && qrDataUrl && (
        <div className="flex justify-center pt-2">
          <img src={qrDataUrl} alt="QR Code Pix" className="w-56 h-56 rounded-lg border border-border" />
        </div>
      )}
    </div>
  );
}

function CheckoutFormInner({ onBack }: CheckoutFormProps) {
  const { items, subtotal, clearCart, hasPreorderItems } = useCart();
  const queryClient = useQueryClient();
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
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ orderNumber: number; orderId: string; orderPayload: any; sentItems: any[] } | null>(null);
  const [debugPayload, setDebugPayload] = useState<any>(null);
  const [debugError, setDebugError] = useState<any>(null);
  const [pixAutoModalOpen, setPixAutoModalOpen] = useState(false);
  const [pixAutoPaid, setPixAutoPaid] = useState(false);
  const [cardBrickOpen, setCardBrickOpen] = useState(false);
  const [cardToken, setCardToken] = useState<string | null>(null);
  const [cardInfo, setCardInfo] = useState<any>(null);
  const [cardStatus, setCardStatus] = useState<'idle' | 'processing' | 'approved' | 'failed' | 'in_review'>('idle');
  const [cardErrorMsg, setCardErrorMsg] = useState<string>('');
  const [cardSuccessOpen, setCardSuccessOpen] = useState(false);
  const [cardBrickKey, setCardBrickKey] = useState(0);
  // Always force a fresh Brick instance whenever the modal is (re)opened.
  const openCardBrick = useCallback(() => {
    setCardBrickKey(k => k + 1);
    setCardBrickOpen(true);
  }, []);
  const handleCardBrickOpenChange = useCallback((open: boolean) => {
    if (open) {
      setCardBrickKey(k => k + 1);
      setCardBrickOpen(true);
    } else {
      setCardBrickOpen(false);
      // Bump key on close so the next open starts from a clean DOM/SDK state.
      setCardBrickKey(k => k + 1);
    }
  }, []);
  

  const safeNeighborhoods = useMemo(
    () => Array.isArray(neighborhoods)
      ? neighborhoods.flatMap((item) => {
          if (!isRecord(item) || typeof item.id !== 'string') return [];
          return [{
            id: item.id,
            name: typeof item.name === 'string' ? item.name : null,
            delivery_fee: safeNum(item.delivery_fee),
          }];
        })
      : [],
    [neighborhoods],
  );

  const isPickup = pickupOnly || (allowPickup && form.delivery_mode === 'pickup');
  const isDelivery = !isPickup;

  const selectedNeighborhood = safeNeighborhoods.find(n => n.id === form.neighborhood_id) ?? null;
  const deliveryFee = isPickup || freeDelivery ? 0 : safeNum(selectedNeighborhood?.delivery_fee);

  const paymentAutomationUnlocked = String(settings?.payment_automation_unlocked ?? '').trim().toLowerCase() === 'true';
  const paymentAutomationEnabled = String(settings?.payment_automation_enabled ?? '').trim().toLowerCase() === 'true';
  const mercadopagoTokenConfigured = !!(settings?.mercadopago_access_token && settings.mercadopago_access_token.trim() !== '');
  const mercadopagoPublicKey = (settings?.mercadopago_public_key || '').trim();
  const showPixAuto = paymentAutomationUnlocked && paymentAutomationEnabled && mercadopagoTokenConfigured;
  const showCardBrick = paymentAutomationUnlocked && paymentAutomationEnabled && !!mercadopagoPublicKey;

  const availablePaymentMethods = useMemo(() => {
    // When automated payments are ENABLED, simplify the list to only "Pix" (automated)
    // and "Cartão de crédito" — to reduce confusion. Manual flows remain unchanged when OFF.
    if (showPixAuto) {
      return [
        { value: 'pix_auto', label: 'Pix', key: 'payment_pix_auto' },
        { value: 'credit', label: 'Cartão de Crédito', key: 'payment_credit' },
      ];
    }
    // Original behavior (unchanged) when automated payments are OFF
    return [
      { value: 'pix', label: 'Pix', key: 'payment_pix' },
      { value: 'cash', label: 'Dinheiro', key: 'payment_cash' },
      { value: 'credit', label: 'Cartão de Crédito', key: 'payment_credit' },
      { value: 'debit', label: 'Cartão de Débito', key: 'payment_debit' },
    ].filter(method => !settings || settings[method.key] !== 'false');
  }, [settings, showPixAuto]);

  // Watch payment confirmation for PIX automated flow on success screen (via Edge Function — bypasses RLS)
  useEffect(() => {
    const orderId = successData?.orderId;
    const isPixAuto = successData?.orderPayload?.payment_method === 'pix_auto';
    if (!success || !orderId || !isPixAuto || pixAutoPaid) return;

    const checkStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-payment-status', {
          body: { order_id: orderId },
        });
        if (error) return;
        if ((data as any)?.payment_status === 'paid') setPixAutoPaid(true);
      } catch (_) { /* ignore */ }
    };

    // Realtime as immediate trigger (best-effort)
    const channel = supabase
      .channel(`checkout-order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { void checkStatus(); }
      )
      .subscribe();

    const interval = setInterval(checkStatus, 6000);

    const revalidate = () => {
      if (document.hidden) return;
      void checkStatus();
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
    window.addEventListener('pageshow', revalidate);

    // Initial check
    void checkStatus();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('pageshow', revalidate);
    };
  }, [success, successData?.orderId, successData?.orderPayload?.payment_method, pixAutoPaid]);

  // Polling for credit card payments that are in review/pending — reflects real DB status
  // back into the UI so the customer doesn't get stuck on "Pagamento em análise"
  // when the webhook eventually marks it as failed (or paid).
  useEffect(() => {
    const orderId = successData?.orderId;
    const isCard = successData?.orderPayload?.payment_method === 'credit';
    if (!success || !orderId || !isCard) return;
    // Only poll while the card status is non-final (in_review/processing/idle).
    if (cardStatus === 'approved' || cardStatus === 'failed') return;

    let cancelled = false;

    const checkStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-payment-status', {
          body: { order_id: orderId },
        });
        if (error || cancelled) return;
        const ps = (data as any)?.payment_status as string | undefined;
        if (ps === 'paid') {
          setCardStatus('approved');
          setCardErrorMsg('');
        } else if (ps === 'failed') {
          setCardStatus('failed');
          setCardErrorMsg('Seu pagamento foi recusado. Você pode tentar novamente com outro cartão.');
        }
      } catch (_) { /* ignore */ }
    };

    // Realtime trigger for instant update when the webhook writes to the row.
    const channel = supabase
      .channel(`checkout-card-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { void checkStatus(); }
      )
      .subscribe();

    const interval = setInterval(checkStatus, 4000);

    const revalidate = () => {
      if (document.hidden) return;
      void checkStatus();
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
    window.addEventListener('pageshow', revalidate);

    void checkStatus();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('pageshow', revalidate);
    };
  }, [success, successData?.orderId, successData?.orderPayload?.payment_method, cardStatus]);


  const normalizedPaymentMethod = typeof form.payment_method === 'string' ? form.payment_method.trim() : '';
  const hasValidPaymentMethod = availablePaymentMethods.some(method => method.value === normalizedPaymentMethod);

  useEffect(() => {
    if (form.neighborhood_id && !safeNeighborhoods.some(n => n.id === form.neighborhood_id)) {
      setForm(prev => ({ ...prev, neighborhood_id: '' }));
    }
  }, [form.neighborhood_id, safeNeighborhoods]);

  useEffect(() => {
    if (form.payment_method && !availablePaymentMethods.some(method => method.value === form.payment_method)) {
      setForm(prev => ({ ...prev, payment_method: '', needs_change: false, change_amount: '' }));
    }
  }, [availablePaymentMethods, form.payment_method]);

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

  const validateForOrder = (): boolean => {
    if (!items.length) return false;

    if (allowPickup && !pickupOnly && !form.delivery_mode) {
      toast({ title: 'Escolha obrigatória', description: 'Selecione Entrega ou Retirada no balcão.', variant: 'destructive' });
      return false;
    }
    if (minOrderEnabled && isDelivery && subtotal < minOrderValue) {
      toast({ title: 'Pedido mínimo', description: `Nosso pedido mínimo é de ${formatCurrency(minOrderValue)}`, variant: 'destructive' });
      return false;
    }
    if (!isValidPhone(form.customer_phone)) {
      toast({ title: 'Telefone inválido', description: 'Informe um telefone válido.', variant: 'destructive' });
      return false;
    }
    if (!form.customer_name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe seu nome.', variant: 'destructive' });
      return false;
    }
    if (isDelivery) {
      if (!freeDelivery && !form.neighborhood_id) {
        toast({ title: 'Bairro obrigatório', description: 'Selecione um bairro para entrega.', variant: 'destructive' });
        return false;
      }
      if (!form.address.trim() || !form.address_number.trim()) {
        toast({ title: 'Endereço obrigatório', description: 'Preencha endereço e número.', variant: 'destructive' });
        return false;
      }
    }
    if (hasPreorderItems && !form.preorder_date) {
      toast({ title: 'Data obrigatória', description: 'Selecione uma data para itens de encomenda', variant: 'destructive' });
      return false;
    }
    if (!hasValidPaymentMethod) {
      toast({ title: 'Pagamento obrigatório', description: 'Selecione uma forma de pagamento para continuar.', variant: 'destructive' });
      return false;
    }
    if (hasPreorderItems && form.preorder_date) {
      const preorderItems = items.filter(i => i.is_preorder && i.preorder_days);
      const maxDays = preorderItems.length > 0 ? Math.max(...preorderItems.map(i => i.preorder_days || 0)) : 0;
      const selected = new Date(form.preorder_date + 'T00:00:00');
      const today = new Date();
      const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDays);
      if (selected < minDate) {
        toast({ title: 'Data inválida', description: `A data mínima é ${maxDays} dia(s) a partir de hoje`, variant: 'destructive' });
        return false;
      }
    }
    return true;
  };

  /**
   * Core order submission. For credit card, accepts an explicit token override
   * so the Brick callback can run the full flow without waiting on state.
   */
  const runOrderSubmission = async (
    opts?: { cardTokenOverride?: string; cardInfoOverride?: any }
  ): Promise<void> => {
    if (!validateForOrder()) return;

    const effectiveCardToken = opts?.cardTokenOverride ?? cardToken;
    const effectiveCardInfo = opts?.cardInfoOverride ?? cardInfo;

    if (form.payment_method === 'credit') {
      if (!showCardBrick) {
        toast({ title: 'Cartão indisponível', description: 'Selecione outra forma de pagamento.', variant: 'destructive' });
        return;
      }
      if (!effectiveCardToken) {
        toast({ title: 'Cartão pendente', description: 'Informe os dados do cartão para continuar.', variant: 'destructive' });
        openCardBrick();
        return;
      }
    }

    const quantityByProduct = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.id] = (acc[item.id] || 0) + item.quantity;
      return acc;
    }, {});

    const stockControlledIds = Array.from(
      new Set(items.filter(item => item.has_stock_control).map(item => item.id))
    );

    if (stockControlledIds.length > 0) {
      const { data: liveProducts, error: liveProductsError } = await supabase
        .from('products')
        .select('id, name, available, has_stock_control, stock_quantity')
        .in('id', stockControlledIds);

      if (liveProductsError) {
        toast({ title: 'Erro ao validar estoque', description: 'Tente novamente em instantes.', variant: 'destructive' });
        return;
      }

      const unavailableProduct = (liveProducts || []).find((product) => {
        if (!product.has_stock_control) return false;
        const requested = quantityByProduct[product.id] || 0;
        const currentStock = normalizeStockQuantity(product.stock_quantity);
        return !getEffectiveAvailability(product) || requested > currentStock;
      });

      if (unavailableProduct) {
        const currentStock = normalizeStockQuantity(unavailableProduct.stock_quantity);
        queryClient.invalidateQueries({ queryKey: ['products'] });
        toast({
          title: 'Estoque indisponível',
          description: currentStock <= 0
            ? `${unavailableProduct.name} está sem estoque no momento.`
            : `Quantidade indisponível para ${unavailableProduct.name}. Restam ${currentStock} unidade(s).`,
          variant: 'destructive',
        });
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
        notes: String(form.notes || '').trim() || null,
      };

      const { data: created, error: createErr } = await supabase.functions.invoke('create-order', {
        body: { order: orderPayload, items },
      });

      let edgeFunctionError: string | null = null;
      if (createErr) {
        try {
          if (typeof createErr.context === 'object' && createErr.context) {
            const ctx = createErr.context as any;
            if (ctx.error) edgeFunctionError = String(ctx.error);
            else if (ctx.message) edgeFunctionError = String(ctx.message);
          }
        } catch {}
        if (!edgeFunctionError) edgeFunctionError = createErr.message || 'Erro ao criar pedido';
      }
      if (!edgeFunctionError && (created as any)?.error) {
        edgeFunctionError = String((created as any).error);
      }
      if (edgeFunctionError) throw new Error(edgeFunctionError);

      const orderNumber = (created as any)?.order?.order_number;
      const orderId = (created as any)?.order?.id || '';
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSuccessData({ orderNumber, orderId, orderPayload, sentItems: [...items] });
      clearCart();
      setSuccess(true);

      if (orderPayload.payment_method === 'pix_auto' && orderId) {
        setPixAutoModalOpen(true);
      }

      if (orderPayload.payment_method === 'credit' && orderId && effectiveCardToken) {
        setCardStatus('processing');
        setCardErrorMsg('');
        try {
          const { data: cardRes, error: cardErr } = await supabase.functions.invoke('mercadopago-create-card-payment', {
            body: {
              order_id: orderId,
              token: effectiveCardToken,
              installments: effectiveCardInfo?.installments || 1,
              payment_method_id: effectiveCardInfo?.payment_method_id,
              issuer_id: effectiveCardInfo?.issuer_id,
            },
          });
          if (cardErr) throw new Error(cardErr.message || 'Erro ao processar cartão');
          const status = (cardRes as any)?.payment_status;
          const mpStatus = (cardRes as any)?.status;
          const statusDetail = (cardRes as any)?.status_detail;
          if (status === 'paid') {
            setCardStatus('approved');
            setCardSuccessOpen(true);
          } else if (mpStatus === 'in_process' || statusDetail === 'pending_review_manual') {
            setCardStatus('in_review');
            setCardErrorMsg('Pagamento em análise, aguarde alguns instantes ou tente outro cartão.');
          } else {
            setCardStatus('failed');
            setCardErrorMsg(statusDetail || 'Pagamento recusado pela operadora.');
            setCardToken(null);
          }
        } catch (e: any) {
          setCardStatus('failed');
          setCardErrorMsg(e?.message || 'Erro ao processar cartão');
          setCardToken(null);
        }
      }
    } catch (err: any) {
      const rawMessage = String(err?.message || 'Erro desconhecido');
      const normalizedMessage = rawMessage.toLowerCase();
      const isStockError = normalizedMessage.includes('estoque')
        || normalizedMessage.includes('indisponível')
        || normalizedMessage.includes('indisponivel')
        || normalizedMessage.includes('foi alterado agora')
        || normalizedMessage.includes('non-2xx');

      if (isStockError) {
        queryClient.invalidateQueries({ queryKey: ['products'] });
        let friendlyMessage: string;
        if (normalizedMessage.includes('insuficiente')) {
          friendlyMessage = rawMessage;
        } else if (normalizedMessage.includes('sem estoque') || normalizedMessage.includes('indisponível') || normalizedMessage.includes('indisponivel')) {
          friendlyMessage = rawMessage;
        } else if (normalizedMessage.includes('foi alterado agora')) {
          friendlyMessage = 'As últimas unidades acabaram de ser vendidas. Atualize seu carrinho e tente novamente.';
        } else {
          friendlyMessage = 'Poxa, esse produto acabou de esgotar. Atualize seu carrinho e tente novamente.';
        }
        toast({ title: '😔 Estoque esgotado', description: friendlyMessage, variant: 'destructive' });
        return;
      }

      setDebugError({
        error: {
          message: rawMessage,
          details: err.details || null,
          hint: err.hint || null,
          code: err.code || null,
          stack: err.stack || null,
        },
        payload: orderPayload,
      });
      toast({ title: 'Erro ao enviar pedido', description: rawMessage, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runOrderSubmission();
  };

  const whatsappOrderEnabled = settings?.whatsapp_order_enabled === 'true';
  const storeWhatsapp = settings?.whatsapp || '';

  if (success) {
    const buildWhatsAppUrl = () => {
      if (!successData || !storeWhatsapp) return '';
      const phone = storeWhatsapp.replace(/\D/g, '');
      const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
      const { orderNumber, orderPayload, sentItems } = successData;

      const PAYMENT_LABELS: Record<string, string> = { pix: 'Pix', pix_auto: 'Pix', cash: 'Dinheiro', credit: 'Cartão de Crédito', debit: 'Cartão de Débito' };
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

      const isPix = orderPayload.payment_method === 'pix';
      const lines = [
        ...(isPix ? ['💲 *Vou realizar o pagamento via Pix e em seguida enviar o comprovante.*', ''] : []),
        `🛒 *NOVO PEDIDO NO CARDÁPIO DIGITAL*`,
        ``,
        `Pedido: #${orderNumber || '---'}`,
        `Cliente: ${orderPayload.customer_name}`,
        `Telefone: ${orderPayload.customer_phone}`,
        ``,
        `Tipo: ${isPickupOrder ? 'Retirada no balcão' : 'Entrega'}`,
      ];
      if (isPickupOrder) {
        const sAddr = settings?.store_address;
        if (sAddr) {
          let fullStoreAddr = sAddr;
          if (settings?.store_address_number) fullStoreAddr += `, ${settings.store_address_number}`;
          if (settings?.store_address_complement) fullStoreAddr += ` - ${settings.store_address_complement}`;
          if (settings?.store_neighborhood) fullStoreAddr += ` (${settings.store_neighborhood})`;
          lines.push(`📍 Retirar em: ${fullStoreAddr}`);
        }
      } else {
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

      if (orderPayload.preorder_date) {
        const [year, month, day] = orderPayload.preorder_date.split('T')[0]?.split('-') ?? [];
        const formatted = year && month && day ? `${day}/${month}/${year}` : orderPayload.preorder_date;
        lines.push(``);
        lines.push(`📅 *Data da encomenda: ${formatted}*`);
      }

      if (orderPayload.notes) {
        lines.push(``);
        lines.push(`📝 *Observações:* ${orderPayload.notes}`);
      }


      const msg = encodeURIComponent(lines.join('\n'));
      return `https://wa.me/${fullPhone}?text=${msg}`;
    };

    const isPixAuto = successData?.orderPayload?.payment_method === 'pix_auto';
    const isCard = successData?.orderPayload?.payment_method === 'credit';
    const cardApproved = isCard && cardStatus === 'approved';
    const cardProcessing = isCard && cardStatus === 'processing';
    const cardFailed = isCard && cardStatus === 'failed';
    const cardInReview = isCard && cardStatus === 'in_review';
    const showWhatsAppCta = whatsappOrderEnabled && storeWhatsapp
      && !(isPixAuto && pixAutoPaid)
      && !isCard; // for card, we show WhatsApp only after approval (handled below)

    return (
      <>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in">
          <CheckCircle2 className="h-20 w-20 text-success mb-4" />
          <h2 className="text-2xl font-extrabold mb-2">Pedido Registrado!</h2>
          {isPixAuto && (
            <Button
              type="button"
              onClick={() => setPixAutoModalOpen(true)}
              className="mb-4 w-full max-w-xs rounded-xl h-11 font-bold"
            >
              Abrir pagamento PIX
            </Button>
          )}

          {/* Card status block */}
          {isCard && cardProcessing && (
            <div className="mb-4 w-full max-w-xs flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando pagamento do cartão...
            </div>
          )}
          {isCard && cardApproved && (
            <p className="text-success font-semibold mb-3">✅ Pagamento confirmado</p>
          )}
          {isCard && cardFailed && (
            <div className="mb-4 w-full max-w-sm">
              <Alert variant="destructive" className="rounded-xl text-left">
                <AlertTitle>Pagamento recusado</AlertTitle>
                <AlertDescription>
                  {cardErrorMsg || 'Seu pagamento foi recusado. Você pode tentar novamente com outro cartão.'}
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                className="mt-3 w-full rounded-xl h-11 font-bold"
                onClick={() => {
                  // Full reset: clear card-related state AND force the Brick to fully remount.
                  setCardToken(null);
                  setCardInfo(null);
                  setCardErrorMsg('');
                  setCardStatus('idle');
                  setCardBrickOpen(false);
                  setCardBrickKey(k => k + 1);
                  // Reopen on next tick so the modal effect runs against the new container id.
                  setTimeout(() => setCardBrickOpen(true), 50);
                }}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {isCard && cardInReview && (
            <div className="mb-4 w-full max-w-sm">
              <Alert className="rounded-xl text-left border-warning/40 bg-warning/10">
                <AlertTitle>Pagamento em análise</AlertTitle>
                <AlertDescription>
                  {cardErrorMsg || 'Pagamento em análise, aguarde alguns instantes ou tente outro cartão.'}
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full rounded-xl h-11 font-bold"
                onClick={() => {
                  setCardToken(null);
                  setCardInfo(null);
                  setCardErrorMsg('');
                  setCardStatus('idle');
                  setCardBrickOpen(false);
                  setCardBrickKey(k => k + 1);
                  setTimeout(() => setCardBrickOpen(true), 50);
                }}
              >
                Tentar outro cartão
              </Button>
            </div>
          )}

          {showWhatsAppCta ? (
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
          ) : isPixAuto && pixAutoPaid ? (
            <p className="text-muted-foreground mb-6">✅ Pagamento confirmado. Pedido enviado com sucesso.</p>
          ) : null}

          {/* WhatsApp CTA for approved card */}
          {cardApproved && whatsappOrderEnabled && storeWhatsapp && (() => {
            const baseUrl = buildWhatsAppUrl();
            let paidUrl = baseUrl;
            if (baseUrl) {
              const [base, query] = baseUrl.split('?text=');
              const decoded = query ? decodeURIComponent(query) : '';
              const intro = `✅ *Olá, acabei de pagar meu pedido com cartão! Pedido #${successData?.orderNumber || '---'}*\n\n`;
              paidUrl = `${base}?text=${encodeURIComponent(intro + decoded)}`;
            }
            return (
              <a href={paidUrl} target="_blank" rel="noopener noreferrer" className="mb-4 w-full max-w-xs">
                <Button type="button" className="w-full rounded-xl h-11 font-bold gap-2 bg-[#25D366] hover:bg-[#1da851] text-white">
                  <MessageCircle className="h-5 w-5" /> Enviar pedido no WhatsApp
                </Button>
              </a>
            );
          })()}

          {!isCard && !isPixAuto && !whatsappOrderEnabled && (
            <p className="text-muted-foreground mb-6">Seu pedido foi recebido com sucesso. Em breve entraremos em contato.</p>
          )}

          <Button onClick={onBack} variant="outline" className="rounded-xl">Fazer novo pedido</Button>
        </div>
        {successData?.orderId && (() => {
          const baseUrl = buildWhatsAppUrl();
          let paidUrl = baseUrl;
          if (baseUrl) {
            const [base, query] = baseUrl.split('?text=');
            const decoded = query ? decodeURIComponent(query) : '';
            const intro = `✅ *Olá, acabei de pagar meu pedido! Pedido #${successData.orderNumber || '---'}*\n\n`;
            paidUrl = `${base}?text=${encodeURIComponent(intro + decoded)}`;
          }
          return (
            <PixAutoPaymentModal
              open={pixAutoModalOpen}
              onOpenChange={setPixAutoModalOpen}
              orderId={successData.orderId}
              orderNumber={successData.orderNumber}
              total={Number(successData.orderPayload?.total) || 0}
              whatsappUrl={baseUrl}
              paidWhatsappUrl={paidUrl}
              whatsappEnabled={!!(whatsappOrderEnabled && storeWhatsapp)}
              onClose={() => setPixAutoModalOpen(false)}
            />
          );
        })()}
      </>
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

        {/* Store address for pickup */}
        {isPickup && (() => {
          const addr = settings?.store_address;
          if (!addr) return null;
          let fullAddr = addr;
          if (settings?.store_address_number) fullAddr += `, ${settings.store_address_number}`;
          if (settings?.store_address_complement) fullAddr += ` - ${settings.store_address_complement}`;
          if (settings?.store_neighborhood) fullAddr += ` (${settings.store_neighborhood})`;
          return (
            <div className="bg-accent/50 rounded-xl p-4">
              <p className="text-sm font-bold mb-1">📍 Retirada no balcão</p>
              <p className="text-sm text-muted-foreground">Retire seu pedido em:</p>
              <p className="text-sm font-semibold text-foreground">{fullAddr}</p>
            </div>
          );
        })()}

        {/* Delivery time estimate */}
        {isDelivery && settings?.delivery_time_estimate && (
          <div className="flex items-center gap-3 bg-accent/50 rounded-xl p-4 border border-border/50">
            <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">Tempo estimado de entrega</p>
              <p className="text-sm font-semibold text-foreground">{settings.delivery_time_estimate}</p>
            </div>
          </div>
        )}

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
            {!freeDelivery && safeNeighborhoods.length > 0 && (
              <div>
                <Label>Bairro *</Label>
                <Select
                  {...(form.neighborhood_id ? { value: form.neighborhood_id } : {})}
                  onValueChange={v => {
                    if (typeof v === 'string' && v) {
                      setTimeout(() => set('neighborhood_id', v), 0);
                    }
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecione o bairro" />
                  </SelectTrigger>
                  <SelectContent>
                    {safeNeighborhoods.map(n => n.id ? (
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

        {/* Coupon field — placed BEFORE payment so the total is finalized first */}
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

        {/* Payment */}
        <div>
          <Label>Forma de pagamento *</Label>
          <Select
            {...(form.payment_method ? { value: form.payment_method } : {})}
            onValueChange={v => {
              if (typeof v === 'string' && v) {
                setTimeout(() => set('payment_method', v), 0);
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

        {form.payment_method === 'credit' && showCardBrick && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Pagamento seguro com cartão</p>
                <p className="text-xs text-muted-foreground">
                  Ao clicar em "Pagar" no formulário do cartão, seu pedido será finalizado e cobrado automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        {form.payment_method === 'credit' && !showCardBrick && (
          <Alert className="rounded-xl border-warning/40 bg-warning/10">
            <AlertTitle>Em breve</AlertTitle>
            <AlertDescription>
              Pagamento com cartão será disponibilizado em breve. Selecione outra forma de pagamento para concluir o pedido.
            </AlertDescription>
          </Alert>
        )}

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

        {/* Coupon was moved above the payment selector for better UX. */}

        {/* Order notes (optional) */}
        <div>
          <Label htmlFor="notes">Observações do pedido (opcional)</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Ex.: sem cebola, ponto da carne, troco..."
            className="rounded-xl mt-1"
            rows={3}
            maxLength={500}
          />
        </div>

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

        {/* Pix payment block */}
        {form.payment_method === 'pix' && settings?.pix_key && settings?.pix_recipient_name && settings?.pix_recipient_city && (
          <PixPaymentBlock
            pixKey={settings.pix_key}
            recipientName={settings.pix_recipient_name}
            recipientCity={settings.pix_recipient_city}
            total={safeNum(total)}
          />
        )}

        {/* For credit card, the "Pagar" button inside the Brick modal finalizes everything.
            We expose a single button here that opens the Brick — no extra "Finalizar" click. */}
        {form.payment_method === 'credit' && showCardBrick ? (
          <Button
            type="button"
            disabled={
              submitting ||
              !items.length ||
              !canCheckout ||
              !hasValidPaymentMethod ||
              (minOrderEnabled && isDelivery && subtotal < minOrderValue)
            }
            onClick={() => {
              if (!validateForOrder()) return;
              openCardBrick();
            }}
            className="w-full h-12 rounded-xl font-bold text-base"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> :
              !canCheckout ? 'Loja Fechada' :
              `Pagar ${formatCurrency(safeNum(total))} com cartão`}
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={
              submitting ||
              !items.length ||
              !canCheckout ||
              !hasValidPaymentMethod ||
              (form.payment_method === 'credit' && !showCardBrick) ||
              (minOrderEnabled && isDelivery && subtotal < minOrderValue)
            }
            className="w-full h-12 rounded-xl font-bold text-base"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> :
              !canCheckout ? 'Loja Fechada' :
              (form.payment_method === 'credit' && !showCardBrick) ? 'Cartão em breve' :
              'Enviar Pedido'}
          </Button>
        )}
      </form>
      </div>

      {showCardBrick && (
        <CardPaymentBrickModal
          open={cardBrickOpen}
          onOpenChange={handleCardBrickOpenChange}
          publicKey={mercadopagoPublicKey}
          amount={safeNum(success ? (successData?.orderPayload?.total || 0) : total)}
          payerEmail={undefined}
          resetKey={cardBrickKey}
          onTokenGenerated={async (token, info) => {
            setCardToken(token);
            setCardInfo(info);

            // Case 1: Retry after failed charge on success screen
            if (success && successData?.orderId && (cardStatus === 'failed' || cardStatus === 'in_review')) {
              setCardBrickOpen(false);
              setCardStatus('processing');
              setCardErrorMsg('');
              try {
                const { data: cardRes, error: cardErr } = await supabase.functions.invoke('mercadopago-create-card-payment', {
                  body: {
                    order_id: successData.orderId,
                    token,
                    installments: info?.installments || 1,
                    payment_method_id: info?.payment_method_id,
                    issuer_id: info?.issuer_id,
                  },
                });
                if (cardErr) throw new Error(cardErr.message || 'Erro ao processar cartão');
                const status = (cardRes as any)?.payment_status;
                const mpStatus = (cardRes as any)?.status;
                const statusDetail = (cardRes as any)?.status_detail;
                if (status === 'paid') {
                  setCardStatus('approved');
                  setCardSuccessOpen(true);
                } else if (mpStatus === 'in_process' || statusDetail === 'pending_review_manual') {
                  setCardStatus('in_review');
                  setCardErrorMsg('Pagamento em análise, aguarde alguns instantes ou tente outro cartão.');
                } else {
                  setCardStatus('failed');
                  setCardErrorMsg(statusDetail || 'Pagamento recusado pela operadora.');
                  setCardToken(null);
                }
              } catch (e: any) {
                setCardStatus('failed');
                setCardErrorMsg(e?.message || 'Erro ao processar cartão');
                setCardToken(null);
              }
              return;
            }

            // Case 2: First-time submit — "Pagar" inside Brick finalizes the entire order
            if (!success) {
              setCardBrickOpen(false);
              await runOrderSubmission({ cardTokenOverride: token, cardInfoOverride: info });
            }
          }}
        />
      )}

      {/* Card success modal — same UX pattern as PIX confirmation */}
      {successData && (() => {
        const buildPaidUrl = () => {
          if (!storeWhatsapp || !successData) return '';
          const phone = storeWhatsapp.replace(/\D/g, '');
          const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
          const { orderNumber, orderPayload, sentItems } = successData;
          const PAYMENT_LABELS: Record<string, string> = { pix: 'Pix', pix_auto: 'Pix', cash: 'Dinheiro', credit: 'Cartão de Crédito', debit: 'Cartão de Débito' };
          const isPickupOrder = orderPayload.address === 'Retirada no balcão';
          let itemsText = '';
          for (const item of sentItems) {
            itemsText += `${item.quantity}x ${item.name} - ${formatCurrency(item.price * item.quantity)}\n`;
          }
          const lines = [
            `✅ *Olá, acabei de pagar meu pedido com cartão de crédito! Pedido #${orderNumber || '---'}*`,
            ``,
            `🛒 *RESUMO DO PEDIDO*`,
            ``,
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
          lines.push(`Pagamento: ${PAYMENT_LABELS[orderPayload.payment_method] || orderPayload.payment_method} (PAGO)`);
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
          return `https://wa.me/${fullPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
        };
        return (
          <CardSuccessModal
            open={cardSuccessOpen}
            onOpenChange={setCardSuccessOpen}
            paidWhatsappUrl={buildPaidUrl()}
            whatsappEnabled={!!(whatsappOrderEnabled && storeWhatsapp)}
          />
        );
      })()}
    </>
  );
}

export function CheckoutForm({ onBack }: CheckoutFormProps) {
  return (
    <div translate="no" className="notranslate">
      <CheckoutErrorBoundary onBack={onBack}>
        <CheckoutFormInner onBack={onBack} />
      </CheckoutErrorBoundary>
    </div>
  );
}
