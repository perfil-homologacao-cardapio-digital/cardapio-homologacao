import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  productId: string | null;
}

export interface ProductVariationsEditorHandle {
  persist: (productId: string) => Promise<void>;
  hasDraftData: () => boolean;
}

interface VariationForm {
  id?: string;
  name: string;
  price: number;
  is_active?: boolean;
}

/**
 * Editor de VARIAÇÕES (tamanhos/versões do produto).
 * Difere dos adicionais: o preço da variação SUBSTITUI o preço base do produto.
 *
 * No banco, é armazenado em `product_option_groups` com `group_kind = 'variation'`,
 * single-choice obrigatório (min=1, max=1), e cada variação é uma linha em `product_options`.
 * Sempre existe apenas 1 grupo de variações por produto, com nome "Variação".
 */
export const ProductVariationsEditor = forwardRef<ProductVariationsEditorHandle, Props>(({ productId }, ref) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: variations = [], isLoading } = useQuery({
    queryKey: ['product-variations', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data: groups, error } = await supabase
        .from('product_option_groups')
        .select('*')
        .eq('product_id', productId!)
        .eq('group_kind', 'variation' as any)
        .eq('is_active', true)
        .order('sort_order')
        .limit(1);
      if (error) throw error;
      if (!groups || groups.length === 0) return [];

      const { data: opts } = await supabase
        .from('product_options')
        .select('*')
        .eq('group_id', groups[0].id)
        .order('sort_order');

      return (opts || []).map(o => ({
        id: o.id,
        name: o.name,
        price: Number(o.price),
        is_active: o.is_active !== false,
      })) as VariationForm[];
    },
  });

  const [local, setLocal] = useState<VariationForm[]>([]);

  useEffect(() => {
    if (productId) setLocal(variations);
  }, [variations, productId]);

  const persistVariations = async (targetProductId: string) => {
    // Soft-delete existing variation groups (and their options) for this product
    const { data: existing } = await supabase
      .from('product_option_groups')
      .select('id')
      .eq('product_id', targetProductId)
      .eq('group_kind', 'variation' as any);

    if (existing && existing.length > 0) {
      const ids = existing.map(g => g.id);
      await supabase.from('product_options').update({ is_active: false }).in('group_id', ids);
      await supabase.from('product_option_groups').update({ is_active: false }).in('id', ids);
    }

    const valid = local.filter(v => v.name.trim());
    if (valid.length === 0) return;

    const { data: newGroup, error: gErr } = await supabase
      .from('product_option_groups')
      .insert({
        product_id: targetProductId,
        name: 'Variação',
        required: true,
        min_select: 1,
        max_select: 1,
        sort_order: -1, // garante render acima dos adicionais
        type: 'single_choice',
        price_mode: 'sum',
        is_active: true,
        group_kind: 'variation',
      } as any)
      .select()
      .single();
    if (gErr) throw gErr;

    const { error: oErr } = await supabase
      .from('product_options')
      .insert(valid.map((v, i) => ({
        group_id: newGroup.id,
        name: v.name.trim(),
        price: v.price || 0,
        sort_order: i,
        is_active: v.is_active !== false,
      })));
    if (oErr) throw oErr;
  };

  useImperativeHandle(ref, () => ({
    persist: async (targetProductId: string) => {
      await persistVariations(targetProductId);
    },
    hasDraftData: () => local.length > 0,
  }), [local]);

  const addVariation = () => setLocal(prev => [...prev, { name: '', price: 0, is_active: true }]);
  const removeVariation = (i: number) => setLocal(prev => prev.filter((_, idx) => idx !== i));
  const updateVariation = (i: number, key: keyof VariationForm, value: any) =>
    setLocal(prev => prev.map((v, idx) => idx === i ? { ...v, [key]: value } : v));
  const move = (i: number, dir: -1 | 1) => {
    setLocal(prev => {
      const next = [...prev];
      const t = i + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!productId) return;
    setSaving(true);
    try {
      await persistVariations(productId);
      queryClient.invalidateQueries({ queryKey: ['product-variations', productId] });
      queryClient.invalidateQueries({ queryKey: ['product-option-groups-store', productId] });
      toast({ title: 'Variações salvas' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar variações', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (productId && isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-3 border border-border/50 rounded-xl p-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm">Variações (tamanhos/versões)</h3>
          <p className="text-[11px] text-muted-foreground">O preço da variação <strong>substitui</strong> o preço base do produto.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs gap-1" onClick={addVariation}>
          <Plus className="h-3 w-3" /> Nova variação
        </Button>
      </div>

      {!productId && (
        <p className="text-[11px] text-muted-foreground">As variações serão salvas automaticamente ao criar o produto.</p>
      )}

      {local.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhuma variação. Clique em "Nova variação" para começar.</p>
      )}

      {local.map((v, i) => (
        <div key={i} className="flex items-center gap-1 p-2 rounded-lg border border-border/50 bg-background">
          <div className="flex flex-col">
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, -1)} disabled={i === 0}>
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, 1)} disabled={i === local.length - 1}>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
          <Input
            value={v.name}
            onChange={e => updateVariation(i, 'name', e.target.value)}
            placeholder="Ex: Média, Grande..."
            className={`rounded-lg text-sm h-8 flex-1 ${v.is_active === false ? 'line-through opacity-60' : ''}`}
          />
          <Input
            type="number"
            step="0.01"
            min={0}
            value={v.price || ''}
            onChange={e => updateVariation(i, 'price', parseFloat(e.target.value) || 0)}
            placeholder="R$ final"
            className="rounded-lg text-sm h-8 w-24"
          />
          <Switch
            checked={v.is_active !== false}
            onCheckedChange={val => updateVariation(i, 'is_active', val)}
          />
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={() => removeVariation(i)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {/* Save button intentionally removed — persisted via main product save */}
    </div>
  );
});

ProductVariationsEditor.displayName = 'ProductVariationsEditor';
