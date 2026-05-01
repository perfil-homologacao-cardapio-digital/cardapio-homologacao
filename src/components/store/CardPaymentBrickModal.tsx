import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';

interface CardPaymentBrickModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicKey: string;
  amount: number;
  payerEmail?: string;
  onTokenGenerated?: (token: string, info: any) => void;
  /** Increment to force a full Brick remount (use after a failed payment retry). */
  resetKey?: number;
}

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
let sdkPromise: Promise<any> | null = null;

function loadMercadoPagoSdk(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if ((window as any).MercadoPago) return Promise.resolve((window as any).MercadoPago);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_URL}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).MercadoPago));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve((window as any).MercadoPago);
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Falha ao carregar SDK Mercado Pago'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export function CardPaymentBrickModal({
  open,
  onOpenChange,
  publicKey,
  amount,
  payerEmail,
  onTokenGenerated,
  resetKey = 0,
}: CardPaymentBrickModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const brickControllerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenized, setTokenized] = useState(false);
  // Unique container id per mount cycle to guarantee a clean DOM node for the Brick.
  const containerId = `cardPaymentBrick_container_${resetKey}`;

  useEffect(() => {
    if (!open) {
      // Defensive teardown when modal closes — guarantees no stale Brick instance
      // or DOM node lingers between openings.
      try {
        brickControllerRef.current?.unmount?.();
      } catch {
        // ignore
      }
      brickControllerRef.current = null;
      const stale = document.getElementById(containerId);
      if (stale) stale.innerHTML = '';
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTokenized(false);

    (async () => {
      try {
        if (!publicKey) throw new Error('Public Key do Mercado Pago não configurada.');
        const MercadoPago = await loadMercadoPagoSdk();
        if (cancelled) return;

        const mp = new MercadoPago(publicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        // Wait for container to be in DOM
        await new Promise(r => setTimeout(r, 50));
        if (cancelled) return;

        const settings = {
          initialization: {
            amount: Number(amount) || 0,
            payer: payerEmail ? { email: payerEmail } : undefined,
          },
          customization: {
            paymentMethods: { maxInstallments: 1 },
            visual: { style: { theme: 'default' } },
          },
          callbacks: {
            onReady: () => {
              if (!cancelled) setLoading(false);
            },
            onSubmit: (cardFormData: any) => {
              return new Promise<void>((resolve) => {
                const token = cardFormData?.token;
                const safeInfo = {
                  payment_method_id: cardFormData?.payment_method_id,
                  issuer_id: cardFormData?.issuer_id,
                  installments: cardFormData?.installments,
                  last_four: cardFormData?.token ? '****' : undefined,
                  email: cardFormData?.payer?.email,
                  cardholderName: cardFormData?.cardholderName ?? cardFormData?.payer?.cardholderName,
                  identificationNumber:
                    cardFormData?.payer?.identification?.number
                    ?? cardFormData?.identificationNumber,
                  identificationType:
                    cardFormData?.payer?.identification?.type
                    ?? cardFormData?.identificationType,
                };
                console.log('[CardBrick] Token gerado:', token);
                console.log('[CardBrick] Info segura:', safeInfo);
                if (!cancelled) {
                  setTokenized(true);
                  onTokenGenerated?.(token, safeInfo);
                }
                resolve();
              });
            },
            onError: (err: any) => {
              console.error('[CardBrick] Erro:', err);
              if (!cancelled) setError(err?.message || 'Erro no formulário de cartão.');
            },
          },
        };

        // Ensure container is empty before mounting (defensive against stale DOM).
        const mountEl = document.getElementById(containerId);
        if (mountEl) mountEl.innerHTML = '';

        brickControllerRef.current = await bricksBuilder.create(
          'cardPayment',
          containerId,
          settings
        );
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Erro ao inicializar pagamento.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        brickControllerRef.current?.unmount?.();
      } catch {
        // ignore
      }
      brickControllerRef.current = null;
      // Clear container DOM so the next mount starts from a clean node.
      const mountEl = document.getElementById(containerId);
      if (mountEl) mountEl.innerHTML = '';
    };
  }, [open, publicKey, amount, payerEmail, onTokenGenerated, resetKey, containerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Pagamento 100% seguro via Mercado Pago
          </DialogTitle>
          <DialogDescription className="text-xs">
            Seus dados são protegidos e processados pelo Mercado Pago. Nenhuma informação sensível do cartão passa pelo nosso sistema.
          </DialogDescription>
        </DialogHeader>

        {tokenized && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span className="font-medium">Cartão validado com sucesso</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="relative min-h-[300px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          <div key={containerId} id={containerId} ref={containerRef} />
        </div>

        <p className="text-[10px] text-center text-muted-foreground">
          Esta etapa apenas valida o cartão. A cobrança ainda não é processada.
        </p>
      </DialogContent>
    </Dialog>
  );
}
