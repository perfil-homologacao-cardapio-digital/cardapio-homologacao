import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, MessageCircle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/format';

interface PixAutoPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: number | null;
  total: number;
  whatsappUrl: string;
  /** WhatsApp URL with the "Olá, acabei de pagar..." prefix + full order summary */
  paidWhatsappUrl?: string;
  whatsappEnabled: boolean;
  onClose: () => void;
}

export function PixAutoPaymentModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  total,
  whatsappUrl,
  paidWhatsappUrl,
  whatsappEnabled,
  onClose,
}: PixAutoPaymentModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [qrCodeBase64, setQrCodeBase64] = useState('');
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reloadKey, setReloadKey] = useState(0);

  const expired = !!(expiresAt && now >= expiresAt && !paid);
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const remainingLabel = `${String(remainingMin).padStart(2, '0')}:${String(remainingSec).padStart(2, '0')}`;

  // Tick every second for countdown
  useEffect(() => {
    if (!open || paid || !expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, paid, expiresAt]);

  // Create payment on open (or when user requests new one)
  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQrCode('');
    setQrCodeBase64('');
    setExpiresAt(null);
    (async () => {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke('mercadopago-create-payment', {
          body: { order_id: orderId },
        });
        if (cancelled) return;
        if (invokeErr) throw new Error(invokeErr.message || 'Erro ao gerar Pix');
        if ((data as any)?.error) throw new Error((data as any).error);
        setQrCode((data as any)?.qr_code || '');
        setQrCodeBase64((data as any)?.qr_code_base64 || '');
        const exp = (data as any)?.expires_at;
        if (exp) setExpiresAt(new Date(exp).getTime());
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Erro ao gerar pagamento Pix');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, orderId, reloadKey]);

  // Unified status checker via Edge Function (bypasses RLS — reliable on mobile/public)
  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-payment-status', {
        body: { order_id: orderId },
      });
      if (error) return false;
      if ((data as any)?.payment_status === 'paid') {
        setPaid(true);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }, [orderId]);

  // Realtime subscription as immediate trigger (best-effort)
  useEffect(() => {
    if (!open || !orderId || paid) return;
    const channel = supabase
      .channel(`order-payment-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { void checkStatus(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, orderId, paid, checkStatus]);

  // Polling fallback every 6s
  useEffect(() => {
    if (!open || !orderId || paid) return;
    const interval = setInterval(() => { void checkStatus(); }, 6000);
    return () => clearInterval(interval);
  }, [open, orderId, paid, checkStatus]);

  // Revalidate when user returns to the page (mobile: returning from banking app)
  useEffect(() => {
    if (!open || !orderId || paid) return;
    const revalidate = () => {
      if (document.hidden) return;
      void checkStatus();
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
    window.addEventListener('pageshow', revalidate);
    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('pageshow', revalidate);
    };
  }, [open, orderId, paid, checkStatus]);

  const handleCopy = useCallback(() => {
    if (!qrCode) return;
    navigator.clipboard.writeText(qrCode);
    setCopied(true);
    toast({ title: 'Código Pix copiado!' });
    setTimeout(() => setCopied(false), 3000);
  }, [qrCode]);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const ok = await checkStatus();
      if (!ok) {
        toast({ title: 'Pagamento ainda não confirmado', description: 'Aguarde alguns instantes.' });
      }
    } finally {
      setChecking(false);
    }
  };

  const finalPaidUrl = paidWhatsappUrl || whatsappUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {paid ? '✅ Pagamento confirmado' : 'Aguardando pagamento via PIX'}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando Pix...</p>
          </div>
        )}

        {!loading && error && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={onClose} variant="outline" className="w-full">Fechar</Button>
          </div>
        )}

        {!loading && !error && !paid && (
          <div className="space-y-4">
            <div className="bg-accent/50 rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">Valor do pedido #{orderNumber || '---'}</p>
              <p className="text-2xl font-extrabold text-primary">{formatCurrency(total)}</p>
            </div>

            {expired ? (
              <div className="space-y-3">
                <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-center">
                  <p className="text-sm font-bold text-destructive">
                    ⏱️ Pix expirado. Gere um novo pagamento.
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full rounded-xl h-11 font-bold"
                  onClick={() => {
                    setExpiresAt(null);
                    setNow(Date.now());
                    setReloadKey((k) => k + 1);
                  }}
                >
                  Gerar novo Pix
                </Button>
              </div>
            ) : (
              <>
                {expiresAt && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Expira em:</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">{remainingLabel}</p>
                  </div>
                )}

                {qrCodeBase64 && (
                  <div className="flex justify-center">
                    <img
                      src={`data:image/png;base64,${qrCodeBase64}`}
                      alt="QR Code Pix"
                      className="w-56 h-56 rounded-lg border border-border"
                    />
                  </div>
                )}

                {qrCode && (
                  <>
                    <Button type="button" className="w-full rounded-xl h-11 font-bold gap-2" onClick={handleCopy}>
                      {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                      {copied ? 'Código copiado!' : 'Copiar código Pix'}
                    </Button>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Ver código Pix copia e cola</summary>
                      <p className="mt-2 break-all font-mono text-[11px] bg-muted p-2 rounded">{qrCode}</p>
                    </details>
                  </>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full rounded-xl h-11"
                  onClick={handleCheckNow}
                  disabled={checking}
                >
                  {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Verificar pagamento
                </Button>

                {whatsappEnabled && whatsappUrl && (
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <Button type="button" variant="outline" className="w-full rounded-xl h-11 gap-2">
                      <MessageCircle className="h-5 w-5" /> Enviar pedido pelo WhatsApp
                    </Button>
                  </a>
                )}

                <p className="text-xs text-center text-muted-foreground">
                  A confirmação é automática assim que o pagamento for recebido.
                </p>
              </>
            )}
          </div>
        )}

        {!loading && paid && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center text-center gap-3">
              <CheckCircle2 className="h-16 w-16 text-success" />
              <p className="text-base font-bold">Pagamento confirmado!</p>
              <p className="text-sm text-muted-foreground">
                Seu pedido #{orderNumber || '---'} foi pago com sucesso.
              </p>
            </div>

            {whatsappEnabled && finalPaidUrl && (
              <>
                <div className="rounded-xl border-2 border-primary/40 bg-primary/10 p-3 text-center">
                  <p className="text-sm font-bold text-foreground">
                    ⚠️ É obrigatório enviar o pedido pelo WhatsApp para a loja dar andamento.
                  </p>
                </div>
                <a href={finalPaidUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Button type="button" className="w-full rounded-xl h-11 font-bold gap-2 bg-[#25D366] hover:bg-[#1da851] text-white">
                    <MessageCircle className="h-5 w-5" /> Enviar pedido pelo WhatsApp
                  </Button>
                </a>
              </>
            )}
            <Button onClick={onClose} variant="outline" className="w-full rounded-xl">Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
