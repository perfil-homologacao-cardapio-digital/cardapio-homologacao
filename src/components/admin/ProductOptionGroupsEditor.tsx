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
  groupKind?: 'addon' | 'combo_choice';
  hidePrice?: boolean;
  title?: string;
  emptyText?: string;
  newButtonLabel?: string;
  titlePlaceholder?: string;
}

export interface ProductOptionGroupsEditorHandle {
  persist: (productId: string) => Promise<void>;
  hasDraftData: () => boolean;
}

interface OptionGroupForm {
  id?: string;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  options: OptionForm[];
}

interface OptionForm {
  id?: string;
  name: string;
  price: number;
  description?: string;
  is_active?: boolean;
}

export const ProductOptionGroupsEditor = forwardRef<ProductOptionGroupsEditorHandle, Props>(({ productId, groupKind = 'addon', hidePrice = false, title, emptyText, newButtonLabel, titlePlaceholder }, ref) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['product-option-groups', productId, groupKind],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_option_groups')
        .select('*')
        .eq('product_id', productId!)
        .eq('is_active', true)
        .eq('group_kind', groupKind as any)
        .order('sort_order');
      if (error) throw error;

      const groupsWithOptions = await Promise.all(
        data.map(async (g) => {
          const { data: opts } = await supabase
            .from('product_options')
            .select('*')
            .eq('group_id', g.id)
            .order('sort_order');
          return {
            id: g.id,
            name: g.name,
            required: g.required,
            min_select: g.min_select,
            max_select: g.max_select,
            options: (opts || []).map(o => ({
              id: o.id,
              name: o.name,
              price: Number(o.price),
              description: (o as any).description || '',
              is_active: o.is_active !== false,
            })),
          } as OptionGroupForm;
        })
      );
      return groupsWithOptions;
    },
  });

  const [localGroups, setLocalGroups] = useState<OptionGroupForm[]>([]);

  useEffect(() => {
    if (productId) setLocalGroups(groups);
  }, [groups, productId]);

  // Persist groups + options for a given productId (used both for save button and external imperative call)
  const persistGroups = async (targetProductId: string) => {
    // Soft-delete existing groups/options of THIS kind only (preserve other kinds: addon, variation, combo_choice)
    const { data: existingGroups } = await supabase
      .from('product_option_groups')
      .select('id')
      .eq('product_id', targetProductId)
      .eq('group_kind', groupKind as any);

    if (existingGroups && existingGroups.length > 0) {
      const groupIds = existingGroups.map(g => g.id);
      await supabase.from('product_options').update({ is_active: false }).in('group_id', groupIds);
      await supabase.from('product_option_groups').update({ is_active: false }).in('id', groupIds);
    }

    for (let gi = 0; gi < localGroups.length; gi++) {
      const g = localGroups[gi];
      if (!g.name.trim()) continue;

      const { data: newGroup, error: gErr } = await supabase
        .from('product_option_groups')
        .insert({
          product_id: targetProductId,
          name: g.name.trim(),
          required: g.required,
          min_select: g.required ? g.min_select : 0,
          max_select: g.max_select,
          sort_order: gi,
          type: 'multiple_choice',
          price_mode: 'sum',
          is_active: true,
          group_kind: groupKind,
        } as any)
        .select()
        .single();

      if (gErr) throw gErr;

      const validOptions = g.options.filter(o => o.name.trim());
      if (validOptions.length > 0) {
        const { error: oErr } = await supabase
          .from('product_options')
          .insert(validOptions.map((o, oi) => ({
            group_id: newGroup.id,
            name: o.name.trim(),
            price: o.price || 0,
            sort_order: oi,
            is_active: o.is_active !== false,
            description: o.description?.trim() || null,
          })) as any);
        if (oErr) throw oErr;
      }
    }
  };

  useImperativeHandle(ref, () => ({
    persist: async (targetProductId: string) => {
      await persistGroups(targetProductId);
    },
    hasDraftData: () => localGroups.length > 0,
  }), [localGroups]);

  const addGroup = () => {
    setLocalGroups(prev => [...prev, {
      name: '',
      required: false,
      min_select: 0,
      max_select: 1,
      options: [],
    }]);
  };

  const removeGroup = (index: number) => {
    setLocalGroups(prev => prev.filter((_, i) => i !== index));
  };

  const updateGroup = (index: number, key: string, value: any) => {
    setLocalGroups(prev => prev.map((g, i) => i === index ? { ...g, [key]: value } : g));
  };

  const moveGroup = (index: number, dir: -1 | 1) => {
    setLocalGroups(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addOption = (groupIndex: number) => {
    setLocalGroups(prev => prev.map((g, i) =>
      i === groupIndex ? { ...g, options: [...g.options, { name: '', price: 0, description: '', is_active: true }] } : g
    ));
  };

  const removeOption = (groupIndex: number, optIndex: number) => {
    setLocalGroups(prev => prev.map((g, i) =>
      i === groupIndex ? { ...g, options: g.options.filter((_, oi) => oi !== optIndex) } : g
    ));
  };

  const updateOption = (groupIndex: number, optIndex: number, key: string, value: any) => {
    setLocalGroups(prev => prev.map((g, i) =>
      i === groupIndex ? {
        ...g,
        options: g.options.map((o, oi) => oi === optIndex ? { ...o, [key]: value } : o)
      } : g
    ));
  };

  const moveOption = (groupIndex: number, optIndex: number, dir: -1 | 1) => {
    setLocalGroups(prev => prev.map((g, i) => {
      if (i !== groupIndex) return g;
      const opts = [...g.options];
      const target = optIndex + dir;
      if (target < 0 || target >= opts.length) return g;
      [opts[optIndex], opts[target]] = [opts[target], opts[optIndex]];
      return { ...g, options: opts };
    }));
  };

  const handleSave = async () => {
    if (!productId) return;
    setSaving(true);
    try {
      await persistGroups(productId);
      queryClient.invalidateQueries({ queryKey: ['product-option-groups', productId, groupKind] });
      toast({ title: 'Opções salvas com sucesso' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar opções', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (productId && isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-4 border border-border/50 rounded-xl p-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">{title || 'Blocos de Escolhas'}</h3>
        <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs gap-1" onClick={addGroup}>
          <Plus className="h-3 w-3" /> {newButtonLabel || 'Novo Bloco'}
        </Button>
      </div>

      {!productId && (
        <p className="text-[11px] text-muted-foreground">Os blocos serão salvos automaticamente ao criar o produto.</p>
      )}

      {localGroups.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">{emptyText || 'Nenhum bloco de escolhas. Clique em "Novo Bloco" para começar.'}</p>
      )}

      {localGroups.map((group, gi) => (
        <div key={gi} className="border border-border rounded-xl p-3 space-y-3 bg-card">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5 pt-1">
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveGroup(gi, -1)} disabled={gi === 0} title="Mover para cima">
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveGroup(gi, 1)} disabled={gi === localGroups.length - 1} title="Mover para baixo">
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <Label className="text-xs">Título do bloco</Label>
                <Input
                  value={group.name}
                  onChange={e => updateGroup(gi, 'name', e.target.value)}
                  placeholder={titlePlaceholder || 'Ex: Escolha seus acompanhamentos'}
                  className="rounded-lg text-sm h-9"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={group.required}
                    onCheckedChange={v => updateGroup(gi, 'required', v)}
                  />
                  <Label className="text-xs">Obrigatório</Label>
                </div>
                {group.required && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Qtd. obrigatória:</Label>
                    <Input
                      type="number"
                      min={1}
                      value={group.min_select}
                      onChange={e => {
                        const v = parseInt(e.target.value) || 1;
                        updateGroup(gi, 'min_select', v);
                        updateGroup(gi, 'max_select', v);
                      }}
                      className="rounded-lg text-sm h-8 w-16"
                    />
                  </div>
                )}
                {!group.required && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Máximo:</Label>
                    <Input
                      type="number"
                      min={1}
                      value={group.max_select}
                      onChange={e => updateGroup(gi, 'max_select', parseInt(e.target.value) || 1)}
                      className="rounded-lg text-sm h-8 w-16"
                    />
                  </div>
                )}
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeGroup(gi)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Opções</Label>
            {group.options.map((opt, oi) => (
              <div key={oi} className="flex flex-col gap-1 p-2 rounded-lg border border-border/50 bg-background">
                <div className="flex items-center gap-1">
                  <div className="flex flex-col">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveOption(gi, oi, -1)} disabled={oi === 0} title="Mover para cima">
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveOption(gi, oi, 1)} disabled={oi === group.options.length - 1} title="Mover para baixo">
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
              <Input
                    value={opt.name}
                    onChange={e => updateOption(gi, oi, 'name', e.target.value)}
                    placeholder="Nome da opção"
                    className={`rounded-lg text-sm h-8 flex-1 ${opt.is_active === false ? 'line-through opacity-60' : ''}`}
                  />
                  {!hidePrice && (
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={opt.price || ''}
                      onChange={e => updateOption(gi, oi, 'price', parseFloat(e.target.value) || 0)}
                      placeholder="+ R$"
                      className="rounded-lg text-sm h-8 w-20"
                    />
                  )}
                  <div className="flex items-center gap-1" title={opt.is_active === false ? 'Inativo' : 'Ativo'}>
                    <Switch
                      checked={opt.is_active !== false}
                      onCheckedChange={v => updateOption(gi, oi, 'is_active', v)}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={() => removeOption(gi, oi)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={opt.description || ''}
                  onChange={e => updateOption(gi, oi, 'description', e.target.value)}
                  placeholder="Descrição (opcional, ex: porção de 30g)"
                  className="rounded-lg text-xs h-7 ml-7"
                />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => addOption(gi)}>
              <Plus className="h-3 w-3" /> Adicionar opção
            </Button>
          </div>
        </div>
      ))}

      {/* Save button intentionally removed — persisted via main product save */}
    </div>
  );
});

ProductOptionGroupsEditor.displayName = 'ProductOptionGroupsEditor';
