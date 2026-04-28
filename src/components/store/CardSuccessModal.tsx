import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, MessageCircle } from 'lucide-react';

interface CardSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paidWhatsappUrl: string;
  whatsappEnabled: boolean;
}

export function CardSuccessModal({
  open,
  onOpenChange,
  paidWhatsappUrl,
  whatsappEnabled,
}: CardSuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-6 w-6" />
            Pagamento confirmado
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pagamento aprovado. Envie o pedido pelo WhatsApp para concluir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-bold text-foreground mb-1">⚠️ ATENÇÃO</p>
            <p className="text-sm text-foreground">
              É <strong>obrigatório</strong> enviar o pedido pelo WhatsApp para que a loja receba seu pedido.
            </p>
          </div>

          {whatsappEnabled && paidWhatsappUrl ? (
            <a
              href={paidWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              <Button
                type="button"
                className="w-full rounded-xl h-12 font-bold gap-2 bg-[#25D366] hover:bg-[#1da851] text-white"
              >
                <MessageCircle className="h-5 w-5" />
                Enviar pedido pelo WhatsApp
              </Button>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Pedido registrado. Em breve entraremos em contato.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
