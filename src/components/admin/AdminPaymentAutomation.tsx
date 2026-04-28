import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Zap, CreditCard, CheckCircle2, ShieldCheck, Sparkles, MessageCircle, Copy } from 'lucide-react';

const UPGRADE_WHATSAPP = '5512996193377';
const UPGRADE_MESSAGE = 'Olá! Quero ativar o upgrade de Pagamentos Automatizados no meu cardápio digital.';

async function upsertSetting(key: string, value: string) {
  // Try update first
  const { data: existing } = await supabase.from('settings').select('id').eq('key', key).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('settings').update({ value }).eq('key', key);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('settings').insert({ key, value });
    if (error) throw error;
  }
}

export function AdminPaymentAutomation() {
  const { data: settings, isLoading } = useSettings();
  const queryClient = useQueryClient();

  const unlocked = settings?.payment_automation_unlocked === 'true';
  const enabledStored = settings?.payment_automation_enabled === 'true';

  const [enabled, setEnabled] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');

  useEffect(() => {
    if (settings) {
      setEnabled(settings.payment_automation_enabled === 'true');
      setAccessToken(settings.mercadopago_access_token || '');
      setPublicKey(settings.mercadopago_public_key || '');
    }
  }, [settings]);

  // Webhook URL futura (informativa)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const webhookUrl = settings?.mercadopago_webhook_url || `${supabaseUrl}/functions/v1/mercadopago-webhook`;

  const saveMutation = useMutation({
    mutationFn: async (payload: { key: string; value: string }[]) => {
      for (const p of payload) await upsertSetting(p.key, p.value);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Configurações salvas' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  const handleToggleEnabled = async (checked: boolean) => {
    setEnabled(checked);
    await saveMutation.mutateAsync([{ key: 'payment_automation_enabled', value: checked ? 'true' : 'false' }]);
  };

  const handleSaveCredentials = () => {
    saveMutation.mutate([
      { key: 'mercadopago_access_token', value: accessToken },
      { key: 'mercadopago_public_key', value: publicKey },
    ]);
  };

  const openUpgradeWhatsApp = () => {
    const url = `https://wa.me/${UPGRADE_WHATSAPP}?text=${encodeURIComponent(UPGRADE_MESSAGE)}`;
    window.open(url, '_blank');
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast({ title: 'URL copiada' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  // ============== TELA COMERCIAL (UPGRADE NÃO LIBERADO) ==============
  if (!unlocked) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-3 py-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Pagamentos Automatizados</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Receba pedidos com Pix e cartão confirmados automaticamente pelo Mercado Pago.
          </p>
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" /> Upgrade disponível
          </Badge>
        </div>

        <Card className="border-2 border-primary/20 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Benefícios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3">
              {[
                { icon: Zap, label: 'Pix automático', desc: 'Confirmação instantânea sem conferência manual' },
                { icon: CreditCard, label: 'Cartão de crédito', desc: 'Aceite cartão direto no checkout' },
                { icon: ShieldCheck, label: 'Pedido com status de pagamento', desc: 'Saiba na hora quem já pagou' },
                { icon: Sparkles, label: 'Mais praticidade para o delivery', desc: 'Foque em produzir, não em conferir' },
                { icon: CheckCircle2, label: 'Menos conferência manual', desc: 'Evite erros e perda de tempo' },
              ].map((b, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <b.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{b.label}</p>
                    <p className="text-xs text-muted-foreground">{b.desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Button onClick={openUpgradeWhatsApp} size="lg" className="w-full gap-2 mt-4">
              <MessageCircle className="h-5 w-5" />
              Quero ativar pagamentos automatizados
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Você será direcionado ao WhatsApp para falar com nossa equipe.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============== PAINEL DE CONFIGURAÇÃO (UPGRADE LIBERADO) ==============
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" /> Pagamentos Automatizados
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure sua integração com o Mercado Pago.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base font-semibold">Ativar pagamentos automatizados</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Quando ligado, novos pedidos poderão ser pagos automaticamente.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={handleToggleEnabled} disabled={saveMutation.isPending} />
          </div>
        </CardContent>
      </Card>

      {!enabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="text-amber-700 dark:text-amber-400">
            ⚠️ Enquanto esta função estiver desligada, o sistema continuará funcionando da forma tradicional.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais Mercado Pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mp-access-token">Access Token Mercado Pago</Label>
            <Input
              id="mp-access-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="APP_USR-..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mp-public-key">Public Key Mercado Pago</Label>
            <Input
              id="mp-public-key"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="APP_USR-..."
            />
          </div>
          <Button onClick={handleSaveCredentials} disabled={saveMutation.isPending} className="w-full sm:w-auto">
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar credenciais
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">URL do Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyWebhook}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Essa URL será usada para configurar o webhook no Mercado Pago.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
