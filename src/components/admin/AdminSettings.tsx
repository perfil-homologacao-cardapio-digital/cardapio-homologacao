import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/imageUtils';
import { WeeklyScheduleEditor } from '@/components/admin/WeeklyScheduleEditor';
import { parseSchedule, type WeeklySchedule } from '@/lib/storeHours';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function AdminSettings() {
  const { data: settings, isLoading } = useSettings();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    business_name: '',
    business_description: '',
    whatsapp: '',
    free_delivery: false,
    delivery_notes: '',
    opening_hours: '',
    allow_pickup: false,
    pickup_only: false,
    min_order_enabled: false,
    min_order_value: '',
    logo_url: '',
    sound_alert: true,
    instagram_url: '',
    payment_pix: true,
    payment_cash: true,
    payment_credit: true,
    payment_debit: true,
    whatsapp_order_enabled: false,
    store_address: '',
    store_address_number: '',
    store_address_complement: '',
    store_neighborhood: '',
  });
  const [schedule, setSchedule] = useState<WeeklySchedule>(() => parseSchedule(null));
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        business_name: settings.business_name || '',
        business_description: settings.business_description || '',
        whatsapp: settings.whatsapp || '',
        free_delivery: settings.free_delivery === 'true',
        delivery_notes: settings.delivery_notes || '',
        opening_hours: settings.opening_hours || '',
        allow_pickup: settings.allow_pickup === 'true',
        pickup_only: settings.pickup_only === 'true',
        min_order_enabled: settings.min_order_enabled === 'true',
        min_order_value: settings.min_order_value || '',
        logo_url: settings.logo_url || '',
        sound_alert: settings.sound_alert !== 'false',
        instagram_url: settings.instagram_url || '',
        payment_pix: settings.payment_pix !== 'false',
        payment_cash: settings.payment_cash !== 'false',
        payment_credit: settings.payment_credit !== 'false',
        payment_debit: settings.payment_debit !== 'false',
        whatsapp_order_enabled: settings.whatsapp_order_enabled === 'true',
        store_address: settings.store_address || '',
        store_address_number: settings.store_address_number || '',
        store_address_complement: settings.store_address_complement || '',
        store_neighborhood: settings.store_neighborhood || '',
      });
      setSchedule(parseSchedule(settings.weekly_schedule));
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const entries = [
        { key: 'business_name', value: form.business_name },
        { key: 'business_description', value: form.business_description },
        { key: 'whatsapp', value: form.whatsapp },
        { key: 'free_delivery', value: form.free_delivery ? 'true' : 'false' },
        { key: 'delivery_notes', value: form.delivery_notes },
        { key: 'opening_hours', value: form.opening_hours },
        { key: 'allow_pickup', value: form.allow_pickup ? 'true' : 'false' },
        { key: 'pickup_only', value: form.pickup_only ? 'true' : 'false' },
        { key: 'min_order_enabled', value: form.min_order_enabled ? 'true' : 'false' },
        { key: 'min_order_value', value: form.min_order_value },
        { key: 'logo_url', value: form.logo_url },
        { key: 'sound_alert', value: form.sound_alert ? 'true' : 'false' },
        { key: 'instagram_url', value: form.instagram_url },
        { key: 'payment_pix', value: form.payment_pix ? 'true' : 'false' },
        { key: 'payment_cash', value: form.payment_cash ? 'true' : 'false' },
        { key: 'payment_credit', value: form.payment_credit ? 'true' : 'false' },
        { key: 'payment_debit', value: form.payment_debit ? 'true' : 'false' },
        { key: 'whatsapp_order_enabled', value: form.whatsapp_order_enabled ? 'true' : 'false' },
        { key: 'store_address', value: form.store_address },
        { key: 'store_address_number', value: form.store_address_number },
        { key: 'store_address_complement', value: form.store_address_complement },
        { key: 'store_neighborhood', value: form.store_neighborhood },
        { key: 'weekly_schedule', value: JSON.stringify(schedule) },
      ];
      for (const entry of entries) {
        const { error } = await supabase.from('settings').upsert(
          { key: entry.key, value: entry.value },
          { onConflict: 'key' }
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Configurações salvas' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'Arquivo muito grande', description: 'O tamanho máximo é 2 MB.', variant: 'destructive' });
      return;
    }
    setUploadingLogo(true);
    try {
      const compressed = await compressImage(file);
      const path = `logo_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('product-images').upload(path, compressed);
      if (error) { toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' }); setUploadingLogo(false); return; }
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      set('logo_url', data.publicUrl);
    } catch (err: any) {
      toast({ title: 'Erro ao comprimir imagem', description: err.message, variant: 'destructive' });
    }
    setUploadingLogo(false);
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-extrabold mb-6">Configurações</h1>
      <div className="space-y-4">
        {/* Logo */}
        <div>
          <Label className="font-bold">Logo do estabelecimento</Label>
          <p className="text-xs text-muted-foreground mb-2">Será exibida no cabeçalho do site. Máx 2 MB.</p>
          {form.logo_url ? (
            <div className="flex items-center gap-3">
              <img src={form.logo_url} className="w-16 h-16 rounded-xl object-cover border border-border" />
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg text-xs gap-1" onClick={() => set('logo_url', '')}>
                <X className="h-3 w-3" /> Remover
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input type="file" accept="image/*" onChange={handleLogoUpload} className="rounded-xl" />
              {uploadingLogo && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3" />}
            </div>
          )}
        </div>

        <div><Label>Nome do negócio</Label><Input value={form.business_name} onChange={e => set('business_name', e.target.value)} className="rounded-xl" /></div>
        <div><Label>Descrição</Label><Textarea value={form.business_description} onChange={e => set('business_description', e.target.value)} className="rounded-xl" /></div>
        <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="(00) 00000-0000" className="rounded-xl" /></div>
        <div><Label>Link do Instagram</Label><Input value={form.instagram_url} onChange={e => set('instagram_url', e.target.value)} placeholder="https://www.instagram.com/sualoja" className="rounded-xl" /></div>

        {/* Endereço da loja */}
        <div className="bg-accent/50 rounded-xl p-4 space-y-3">
          <Label className="font-bold">📍 Endereço da loja (retirada no balcão)</Label>
          <p className="text-xs text-muted-foreground">Exibido ao cliente quando selecionar retirada no balcão</p>
          <div><Label>Rua / Avenida</Label><Input value={form.store_address} onChange={e => set('store_address', e.target.value)} placeholder="Ex: Rua das Flores" className="rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Número</Label><Input value={form.store_address_number} onChange={e => set('store_address_number', e.target.value)} placeholder="123" className="rounded-xl" /></div>
            <div><Label>Complemento</Label><Input value={form.store_address_complement} onChange={e => set('store_address_complement', e.target.value)} placeholder="Sala 1" className="rounded-xl" /></div>
          </div>
          <div><Label>Bairro</Label><Input value={form.store_neighborhood} onChange={e => set('store_neighborhood', e.target.value)} placeholder="Centro" className="rounded-xl" /></div>
        </div>
        <div><Label>Notas de entrega</Label><Textarea value={form.delivery_notes} onChange={e => set('delivery_notes', e.target.value)} className="rounded-xl" /></div>
        <WeeklyScheduleEditor schedule={schedule} onChange={setSchedule} />
        <div className="flex items-center justify-between bg-accent/50 rounded-xl p-4">
          <div>
            <Label className="font-bold">Entrega grátis</Label>
            <p className="text-xs text-muted-foreground">Desativa a seleção de bairro e taxa de entrega</p>
          </div>
          <Switch checked={form.free_delivery} onCheckedChange={v => set('free_delivery', v)} />
        </div>
        <div className="flex items-center justify-between bg-accent/50 rounded-xl p-4">
          <div>
            <Label className="font-bold">Permitir retirada no balcão</Label>
            <p className="text-xs text-muted-foreground">Exibe opção de retirada no balcão no checkout</p>
          </div>
          <Switch checked={form.allow_pickup} onCheckedChange={v => set('allow_pickup', v)} />
        </div>
        <div className="flex items-center justify-between bg-accent/50 rounded-xl p-4">
          <div>
            <Label className="font-bold">Apenas retirada no balcão</Label>
            <p className="text-xs text-muted-foreground">Desativa a opção de entrega; somente retirada no balcão</p>
          </div>
          <Switch checked={form.pickup_only} onCheckedChange={v => set('pickup_only', v)} />
        </div>
        <div className="flex items-center justify-between bg-accent/50 rounded-xl p-4">
          <div>
            <Label className="font-bold">Pedido mínimo</Label>
            <p className="text-xs text-muted-foreground">Exige valor mínimo para finalizar pedido</p>
          </div>
          <Switch checked={form.min_order_enabled} onCheckedChange={v => set('min_order_enabled', v)} />
        </div>
        {form.min_order_enabled && (
          <div>
            <Label>Valor mínimo do pedido (R$)</Label>
            <Input type="number" step="0.01" min="0" value={form.min_order_value} onChange={e => set('min_order_value', e.target.value)} placeholder="Ex: 25.00" className="rounded-xl" />
          </div>
        )}
        {/* Formas de pagamento */}
        <div className="bg-accent/50 rounded-xl p-4 space-y-3">
          <Label className="font-bold">Formas de pagamento aceitas</Label>
          <p className="text-xs text-muted-foreground">Desmarque para ocultar no checkout do cliente</p>
          <div className="space-y-2">
            {[
              { key: 'payment_pix', label: 'Pix' },
              { key: 'payment_cash', label: 'Dinheiro' },
              { key: 'payment_credit', label: 'Cartão de Crédito' },
              { key: 'payment_debit', label: 'Cartão de Débito' },
            ].map(pm => (
              <div key={pm.key} className="flex items-center justify-between">
                <Label>{pm.label}</Label>
                <Switch checked={(form as any)[pm.key]} onCheckedChange={v => set(pm.key, v)} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between bg-accent/50 rounded-xl p-4">
          <div>
            <Label className="font-bold">📲 Receber pedidos também no WhatsApp</Label>
            <p className="text-xs text-muted-foreground">Após finalizar, o cliente poderá enviar o pedido para o WhatsApp da loja</p>
          </div>
          <Switch checked={form.whatsapp_order_enabled} onCheckedChange={v => set('whatsapp_order_enabled', v)} />
        </div>
        <div className="flex items-center justify-between bg-accent/50 rounded-xl p-4">
          <div>
            <Label className="font-bold">🔔 Aviso sonoro de novos pedidos</Label>
            <p className="text-xs text-muted-foreground">Toca um sino quando chegar pedido novo não visualizado</p>
          </div>
          <Switch checked={form.sound_alert} onCheckedChange={v => set('sound_alert', v)} />
        </div>
        <Button className="w-full rounded-xl h-11 font-bold" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}
