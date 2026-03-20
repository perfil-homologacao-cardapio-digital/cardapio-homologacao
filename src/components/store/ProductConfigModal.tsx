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
  options: { id: string; name: string; price: number }[];
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
            options: (opts || []).map(o => ({ id: o.id, name: o.name, price: Number(o.price) })),
          };
        })
      );
      return result;
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
        newErrors[group.id] = `Selecione ${group.min_select} opção(ões) em "${group.name}"`;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calcExtras = (): number => {
    let extras = 0;
    for (const group of groups) {
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
            price: opt.price,
          });
        }
      }
    }

    const extras = calcExtras();

    addItem({
      id: product.id,
      name: product.name,
      price: product.price + extras,
      image_url: product.image_url,
      is_preorder: product.is_preorder,
      preorder_days: product.preorder_days,
      selections: itemSelections,
    });

    onOpenChange(false);
  };

  const extras = calcExtras();
  const totalPrice = product.price + extras;

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
              const isRadio = group.max_select === 1;
              return (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm">{group.name}</h4>
                    {group.required && (
                      <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Obrigatório ({group.min_select})
                      </span>
                    )}
                    {!group.required && group.max_select > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        Até {group.max_select}
                      </span>
                    )}
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
                          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                          }`}
                          onClick={() => toggleOption(group.id, opt.id, group.max_select)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOption(group.id, opt.id, group.max_select)}
                            className="pointer-events-none"
                          />
                          <span className="flex-1 text-sm">{opt.name}</span>
                          {opt.price > 0 && (
                            <span className="text-xs text-muted-foreground">+{formatCurrency(opt.price)}</span>
                          )}
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
