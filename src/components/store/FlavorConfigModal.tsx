import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { ShoppingCart, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FlavorConfigModalProps {
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    is_preorder: boolean;
    preorder_days: number | null;
    flavor_count: number | null;
    flavor_price_rule: string | null;
    pizza_has_stuffed_crust?: boolean;
    has_stock_control?: boolean;
    stock_quantity?: number | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FlavorConfigModal({ product, open, onOpenChange }: FlavorConfigModalProps) {
  const { addItem } = useCart();
  const [selected, setSelected] = useState<string[]>([]);
  const [wantsCrust, setWantsCrust] = useState(false);
  const [selectedCrustId, setSelectedCrustId] = useState<string | null>(null);

  const { data: flavors = [], isLoading } = useQuery({
    queryKey: ['flavor-items-store', product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flavor_items')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const hasCrust = product.pizza_has_stuffed_crust === true;

  const { data: crustOptions = [] } = useQuery({
    queryKey: ['crust-options-store', product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pizza_crust_options' as any)
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data as any[];
    },
    enabled: open && hasCrust,
  });

  useEffect(() => {
    if (open) {
      setSelected([]);
      setWantsCrust(false);
      setSelectedCrustId(null);
    }
  }, [open]);

  const maxFlavors = product.flavor_count || 1;
  const priceRule = product.flavor_price_rule || 'most_expensive';

  const selectedFlavors = flavors.filter(f => selected.includes(f.id));

  const calcFlavorPrice = (): number => {
    if (selectedFlavors.length === 0) return 0;
    const prices = selectedFlavors.map(f => Number(f.price));
    if (priceRule === 'average') {
      return prices.reduce((s, p) => s + p, 0) / prices.length;
    }
    return Math.max(...prices);
  };

  const flavorPrice = calcFlavorPrice();
  const selectedCrust = crustOptions.find((c: any) => c.id === selectedCrustId);
  const crustPrice = wantsCrust && selectedCrust ? Number(selectedCrust.price) : 0;
  const finalPrice = flavorPrice + crustPrice;
  const canAdd = selected.length === maxFlavors && (!wantsCrust || selectedCrustId !== null);

  const toggleFlavor = (flavorId: string) => {
    setSelected(prev => {
      if (prev.includes(flavorId)) {
        return prev.filter(id => id !== flavorId);
      }
      if (prev.length >= maxFlavors) {
        if (maxFlavors === 1) return [flavorId];
        return prev;
      }
      return [...prev, flavorId];
    });
  };

  const handleAdd = () => {
    if (!canAdd) {
      toast({ title: `Escolha exatamente ${maxFlavors} sabor(es).`, variant: 'destructive' });
      return;
    }

    const selections = selectedFlavors.map(f => ({
      group_id: product.id,
      group_name: 'Sabores',
      option_id: f.id,
      option_name: f.name,
      price: Number(f.price),
    }));

    if (wantsCrust && selectedCrust) {
      selections.push({
        group_id: null as any,
        group_name: 'Borda recheada',
        option_id: selectedCrust.id,
        option_name: selectedCrust.name,
        price: Number(selectedCrust.price),
      });
    }

    addItem({
      id: product.id,
      name: product.name,
      price: finalPrice,
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
              <p className="text-sm font-bold">Escolha {maxFlavors} sabor(es)</p>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${selected.length === maxFlavors ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                {selected.length} / {maxFlavors}
              </span>
            </div>

            {selected.length < maxFlavors && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Selecione {maxFlavors - selected.length} sabor(es)
              </p>
            )}

            <div className="space-y-1.5">
              {flavors.map(flavor => {
                const isSelected = selected.includes(flavor.id);
                const isDisabled = !isSelected && selected.length >= maxFlavors && maxFlavors > 1;
                return (
                  <label
                    key={flavor.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : isDisabled ? 'border-border opacity-50 cursor-not-allowed' : 'border-border hover:border-primary/30'
                    }`}
                    onClick={(e) => { if (!isDisabled) { e.preventDefault(); toggleFlavor(flavor.id); } }}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isDisabled}
                      className="pointer-events-none"
                    />
                    <span className="flex-1 text-sm">{flavor.name}</span>
                    <span className="text-xs text-muted-foreground">{formatCurrency(Number(flavor.price))}</span>
                  </label>
                );
              })}
            </div>

            {selected.length === maxFlavors && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                Regra: {priceRule === 'average' ? 'Média dos sabores' : 'Sabor mais caro'} → <span className="font-bold text-foreground">{formatCurrency(flavorPrice)}</span>
              </div>
            )}

            {/* Crust section */}
            {hasCrust && crustOptions.length > 0 && selected.length === maxFlavors && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-bold">Deseja borda recheada?</p>
                <RadioGroup
                  value={wantsCrust ? 'yes' : 'no'}
                  onValueChange={v => {
                    setWantsCrust(v === 'yes');
                    if (v === 'no') setSelectedCrustId(null);
                  }}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id="crust-no" />
                    <Label htmlFor="crust-no" className="text-sm cursor-pointer">Não</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id="crust-yes" />
                    <Label htmlFor="crust-yes" className="text-sm cursor-pointer">Sim</Label>
                  </div>
                </RadioGroup>

                {wantsCrust && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Escolha o sabor da borda:</p>
                    <RadioGroup value={selectedCrustId || ''} onValueChange={setSelectedCrustId}>
                      {crustOptions.map((crust: any) => (
                        <label
                          key={crust.id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            selectedCrustId === crust.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                          }`}
                        >
                          <RadioGroupItem value={crust.id} id={`crust-${crust.id}`} />
                          <span className="flex-1 text-sm">{crust.name}</span>
                          <span className="text-xs text-muted-foreground">+{formatCurrency(Number(crust.price))}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <Button className="w-full h-12 rounded-xl font-bold gap-2" onClick={handleAdd} disabled={!canAdd}>
                <ShoppingCart className="h-4 w-4" />
                Adicionar — {formatCurrency(finalPrice)}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
