import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/format';
import { useCart, type CartItemSelection } from '@/lib/cart';
import { ShoppingCart, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ProductConfigModalProps {
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    is_preorder: boolean;
    preorder_days: number | null;
    has_stock_control?: boolean;
    stock_quantity?: number | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  kind: 'addon' | 'variation';
  options: { id: string; name: string; price: number; description?: string | null }[];
}

export function ProductConfigModal({ product, open, onOpenChange }: ProductConfigModalProps) {
  const { addItem } = useCart();
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['product-option-groups-store', product.id],
    queryFn: async () => {
      const { data: gData, error: gErr } = await supabase
        .from('product_option_groups')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('sort_order');
      if (gErr) throw gErr;

      const result: OptionGroup[] = await Promise.all(
        (gData || []).map(async (g) => {
          const { data: opts } = await supabase
            .from('product_options')
            .select('*')
            .eq('group_id', g.id)
            .eq('is_active', true)
            .order('sort_order');
          return {
            id: g.id,
            name: g.name,
            required: g.required,
            min_select: g.min_select,
            max_select: g.max_select,
            kind: ((g as any).group_kind === 'variation' ? 'variation' : 'addon') as 'addon' | 'variation',
            options: (opts || []).map(o => ({
              id: o.id,
              name: o.name,
              price: Number(o.price),
              description: (o as any).description || null,
            })),
          };
        })
      );
      // Variations always render first
      return result.sort((a, b) => {
        if (a.kind === b.kind) return 0;
        return a.kind === 'variation' ? -1 : 1;
      });
    },
    enabled: open,
  });

  // Reset selections when modal opens
  useEffect(() => {
    if (open) {
      setSelections({});
      setErrors({});
    }
  }, [open]);

  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter(id => id !== optionId) };
      }
      if (current.length >= maxSelect) {
        // Replace last if at max
        if (maxSelect === 1) {
          return { ...prev, [groupId]: [optionId] };
        }
        return prev;
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
    // Clear error for this group
    setErrors(prev => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const group of groups) {
      const selected = selections[group.id] || [];
      if (group.required && selected.length < group.min_select) {
        newErrors[group.id] = group.kind === 'variation'
          ? `Escolha uma opção em "${group.name}"`
          : `Selecione ${group.min_select} opção(ões) em "${group.name}"`;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Variation defines the BASE price (replaces product.price). Addons SUM on top.
  const variationGroup = groups.find(g => g.kind === 'variation');
  const selectedVariation = variationGroup
    ? variationGroup.options.find(o => (selections[variationGroup.id] || [])[0] === o.id) || null
    : null;
  const basePrice = selectedVariation ? selectedVariation.price : product.price;

  const calcAddons = (): number => {
    let extras = 0;
    for (const group of groups) {
      if (group.kind === 'variation') continue;
      const selected = selections[group.id] || [];
      for (const optId of selected) {
        const opt = group.options.find(o => o.id === optId);
        if (opt) extras += opt.price;
      }
    }
    return extras;
  };

  const handleAdd = () => {
    if (!validate()) {
      toast({ title: 'Preencha as opções obrigatórias', variant: 'destructive' });
      return;
    }

    const itemSelections: CartItemSelection[] = [];
    for (const group of groups) {
      const selected = selections[group.id] || [];
      for (const optId of selected) {
        const opt = group.options.find(o => o.id === optId);
        if (opt) {
          itemSelections.push({
            group_id: group.id,
            group_name: group.name,
            option_id: optId,
            option_name: opt.name,
            // For variations we store the FINAL price; for addons the +delta (existing behavior)
            price: opt.price,
          });
        }
      }
    }

    const addons = calcAddons();
    const finalPrice = basePrice + addons;
    const itemName = selectedVariation ? `${product.name} (${selectedVariation.name})` : product.name;

    addItem({
      id: product.id,
      name: itemName,
      price: finalPrice,
      image_url: product.image_url,
      is_preorder: product.is_preorder,
      preorder_days: product.preorder_days,
      has_stock_control: product.has_stock_control,
      stock_quantity: product.stock_quantity,
      selections: itemSelections,
    });

    onOpenChange(false);
  };

  const addons = calcAddons();
  const totalPrice = basePrice + addons;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{product.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            {groups.map(group => {
              const selected = selections[group.id] || [];
              const isVariation = group.kind === 'variation';
              return (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm">
                      {isVariation ? 'Escolha uma opção' : group.name}
                    </h4>
                    {isVariation ? (
                      <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Obrigatório
                      </span>
                    ) : group.required ? (
                      <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Obrigatório ({group.min_select})
                      </span>
                    ) : group.max_select > 1 ? (
                      <span className="text-[10px] text-muted-foreground">
                        Até {group.max_select}
                      </span>
                    ) : null}
                  </div>

                  {errors[group.id] && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {errors[group.id]}
                    </p>
                  )}

                  <div className="space-y-1.5">
                    {group.options.map(opt => {
                      const isSelected = selected.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                          }`}
                          onClick={() => toggleOption(group.id, opt.id, group.max_select)}
                        >
                          {isVariation ? (
                            <span className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 ${isSelected ? 'border-primary' : 'border-muted-foreground/40'}`}>
                              {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                            </span>
                          ) : (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOption(group.id, opt.id, group.max_select)}
                              className="pointer-events-none mt-0.5"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm leading-tight">{opt.name}</span>
                            {opt.description && (
                              <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.description}</span>
                            )}
                          </div>
                          {isVariation ? (
                            <span className="text-xs font-bold text-primary mt-0.5">{formatCurrency(opt.price)}</span>
                          ) : opt.price > 0 ? (
                            <span className="text-xs text-muted-foreground mt-0.5">+{formatCurrency(opt.price)}</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="border-t pt-4">
              <Button className="w-full h-12 rounded-xl font-bold gap-2" onClick={handleAdd}>
                <ShoppingCart className="h-4 w-4" />
                Adicionar — {formatCurrency(totalPrice)}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
