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
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComboConfigModal({ product, open, onOpenChange }: ComboConfigModalProps) {
  const { addItem } = useCart();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

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

  useEffect(() => {
    if (open) setQuantities({});
  }, [open]);

  const minQty = product.combo_min_qty || 1;
  const maxQty = product.combo_max_qty || null;

  const totalQty = Object.values(quantities).reduce((s, q) => s + q, 0);
  const totalPrice = comboItems.reduce((s, item) => s + (quantities[item.id] || 0) * Number(item.price), 0);

  const canAdd = totalQty >= minQty && (!maxQty || totalQty <= maxQty);

  const updateQty = (itemId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      // Check max
      if (delta > 0 && maxQty && totalQty >= maxQty) return prev;
      return { ...prev, [itemId]: next };
    });
  };

  const handleAdd = () => {
    if (!canAdd) {
      toast({ title: `Escolha pelo menos ${minQty} unidade(s) para montar seu combo.`, variant: 'destructive' });
      return;
    }

    const selections = comboItems
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

    addItem({
      id: product.id,
      name: product.name,
      price: totalPrice,
      image_url: product.image_url,
      is_preorder: product.is_preorder,
      preorder_days: product.preorder_days,
      has_stock_control: product.has_stock_control,
      stock_quantity: product.stock_quantity,
      selections,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{product.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Monte seu combo</p>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${canAdd ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                Escolhidos: {totalQty}{maxQty ? ` / máx. ${maxQty}` : ''} {!canAdd && `(mín. ${minQty})`}
              </span>
            </div>

            {!canAdd && totalQty < minQty && (
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
                      <p className="text-xs text-muted-foreground">{formatCurrency(Number(item.price))}</p>
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
