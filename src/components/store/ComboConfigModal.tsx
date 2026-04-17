import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { ShoppingCart, Loader2, Plus, Minus, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ComboConfigModalProps {
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    is_preorder: boolean;
    preorder_days: number | null;
    combo_min_qty: number | null;
    combo_max_qty: number | null;
    has_stock_control?: boolean;
    stock_quantity?: number | null;
    combo_price_mode?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComboConfigModal({ product, open, onOpenChange }: ComboConfigModalProps) {
  const { addItem } = useCart();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // choiceSelections: groupId -> Set<optionId>
  const [choiceSelections, setChoiceSelections] = useState<Record<string, Set<string>>>({});

  const { data: comboItems = [], isLoading } = useQuery({
    queryKey: ['combo-items-store', product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combo_items')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Combo choice blocks (group_kind = 'combo_choice') + their active options
  const { data: choiceGroups = [], isLoading: loadingChoices } = useQuery({
    queryKey: ['combo-choice-groups-store', product.id],
    enabled: open,
    queryFn: async () => {
      const { data: groups, error } = await supabase
        .from('product_option_groups')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .eq('group_kind', 'combo_choice' as any)
        .order('sort_order');
      if (error) throw error;
      if (!groups || groups.length === 0) return [];
      const withOpts = await Promise.all(groups.map(async (g) => {
        const { data: opts } = await supabase
          .from('product_options')
          .select('*')
          .eq('group_id', g.id)
          .eq('is_active', true)
          .order('sort_order');
        return { ...g, options: opts || [] };
      }));
      return withOpts;
    },
  });

  useEffect(() => {
    if (open) {
      setQuantities({});
      setChoiceSelections({});
    }
  }, [open]);

  const minQty = product.combo_min_qty || 1;
  const maxQty = product.combo_max_qty || null;
  const isFixedPrice = (product.combo_price_mode || 'items') === 'fixed';

  const totalQty = Object.values(quantities).reduce((s, q) => s + q, 0);
  const totalPrice = isFixedPrice ? product.price : comboItems.reduce((s, item) => s + (quantities[item.id] || 0) * Number(item.price), 0);

  const choicesValid = choiceGroups.every(g => {
    const selected = choiceSelections[g.id]?.size || 0;
    const minSel = g.required ? Math.max(g.min_select || 1, 1) : (g.min_select || 0);
    const maxSel = g.max_select || 1;
    return selected >= minSel && selected <= maxSel;
  });

  const canAdd = totalQty >= minQty && (!maxQty || totalQty <= maxQty) && choicesValid;

  const updateQty = (itemId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (delta > 0 && maxQty && totalQty >= maxQty) return prev;
      return { ...prev, [itemId]: next };
    });
  };

  const toggleChoice = (group: any, optionId: string) => {
    setChoiceSelections(prev => {
      const current = new Set(prev[group.id] || []);
      const maxSel = group.max_select || 1;
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (maxSel === 1) {
          current.clear();
          current.add(optionId);
        } else {
          if (current.size >= maxSel) return prev;
          current.add(optionId);
        }
      }
      return { ...prev, [group.id]: current };
    });
  };

  const handleAdd = () => {
    if (!canAdd) {
      if (totalQty < minQty) {
        toast({ title: `Escolha pelo menos ${minQty} unidade(s) para montar seu combo.`, variant: 'destructive' });
      } else if (!choicesValid) {
        const missing = choiceGroups.find(g => {
          const selected = choiceSelections[g.id]?.size || 0;
          const minSel = g.required ? Math.max(g.min_select || 1, 1) : (g.min_select || 0);
          return selected < minSel;
        });
        toast({ title: `Complete a escolha: ${missing?.name || 'bloco obrigatório'}`, variant: 'destructive' });
      }
      return;
    }

    const itemSelections = comboItems
      .filter(item => (quantities[item.id] || 0) > 0)
      .flatMap(item => {
        const qty = quantities[item.id] || 0;
        return Array.from({ length: qty }, () => ({
          group_id: product.id,
          group_name: 'Combo',
          option_id: item.id,
          option_name: item.name,
          price: Number(item.price),
        }));
      });

    const choiceSels = choiceGroups.flatMap(g => {
      const ids = Array.from(choiceSelections[g.id] || []);
      return ids.map(optId => {
        const opt = g.options.find((o: any) => o.id === optId);
        return {
          group_id: g.id,
          group_name: g.name,
          option_id: optId,
          option_name: opt?.name || '',
          price: 0,
        };
      });
    });

    addItem({
      id: product.id,
      name: product.name,
      price: totalPrice,
      image_url: product.image_url,
      is_preorder: product.is_preorder,
      preorder_days: product.preorder_days,
      has_stock_control: product.has_stock_control,
      stock_quantity: product.stock_quantity,
      selections: [...itemSelections, ...choiceSels],
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{product.name}</DialogTitle>
        </DialogHeader>

        {isLoading || loadingChoices ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Monte seu combo</p>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${totalQty >= minQty && (!maxQty || totalQty <= maxQty) ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                Escolhidos: {totalQty}{maxQty ? ` / máx. ${maxQty}` : ''} {totalQty < minQty && `(mín. ${minQty})`}
              </span>
            </div>

            {totalQty < minQty && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Escolha pelo menos {minQty} unidade(s)
              </p>
            )}

            <div className="space-y-2">
              {comboItems.map(item => {
                const qty = quantities[item.id] || 0;
                const atMax = !!maxQty && totalQty >= maxQty && qty === 0;
                return (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      {!isFixedPrice && <p className="text-xs text-muted-foreground">{formatCurrency(Number(item.price))}</p>}
                    </div>
                    <div className="flex items-center gap-1 border border-border rounded-full bg-muted/50">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full p-0" onClick={() => updateQty(item.id, -1)} disabled={qty === 0}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-xs font-bold">{qty}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full p-0" onClick={() => updateQty(item.id, 1)} disabled={atMax || (!!maxQty && totalQty >= maxQty)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Combo choice blocks */}
            {choiceGroups.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                {choiceGroups.map((g: any) => {
                  const selected = choiceSelections[g.id] || new Set<string>();
                  const maxSel = g.max_select || 1;
                  const minSel = g.required ? Math.max(g.min_select || 1, 1) : (g.min_select || 0);
                  const isValid = selected.size >= minSel && selected.size <= maxSel;
                  const isSingle = maxSel === 1;
                  return (
                    <div key={g.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold">{g.name}{g.required && <span className="text-destructive ml-1">*</span>}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isValid ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                          {isSingle ? (g.required ? 'obrigatório' : 'opcional') : `${selected.size}/${maxSel}`}
                        </span>
                      </div>
                      {g.options.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sem opções disponíveis no momento.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {g.options.map((opt: any) => {
                            const isSelected = selected.has(opt.id);
                            const disabled = !isSelected && !isSingle && selected.size >= maxSel;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => !disabled && toggleChoice(g, opt.id)}
                                disabled={disabled}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`flex-shrink-0 ${isSingle ? 'rounded-full' : 'rounded'} h-4 w-4 border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`}>
                                  {isSelected && <div className={`${isSingle ? 'h-1.5 w-1.5 rounded-full bg-primary-foreground' : 'h-2 w-2 bg-primary-foreground rounded-sm'}`} />}
                                </div>
                                <span className="text-sm font-medium flex-1">{opt.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t pt-4">
              <Button className="w-full h-12 rounded-xl font-bold gap-2" onClick={handleAdd} disabled={!canAdd}>
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
