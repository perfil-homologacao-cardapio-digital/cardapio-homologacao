import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { getAvailableStock, getEffectiveAvailability, getLowStockLabel } from '@/lib/stock';
import { ShoppingCart, Plus, Minus, Clock, AlertCircle, X } from 'lucide-react';
import { ProductConfigModal } from './ProductConfigModal';
import { ComboConfigModal } from './ComboConfigModal';
import { FlavorConfigModal } from './FlavorConfigModal';

interface ProductDetailModalProps {
  product: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    image_url: string | null;
    available: boolean;
    is_preorder: boolean;
    preorder_days: number | null;
    has_options: boolean;
    product_mode?: string;
    combo_min_qty?: number | null;
    combo_max_qty?: number | null;
    flavor_count?: number | null;
    flavor_price_rule?: string | null;
    has_stock_control?: boolean;
    stock_quantity?: number | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductDetailModal({ product, open, onOpenChange }: ProductDetailModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [configOpen, setConfigOpen] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [flavorOpen, setFlavorOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const mode = product.product_mode || 'normal';
  const showChooseButton = mode === 'combo' || mode === 'flavors' || product.has_options;
  const chooseLabel = mode === 'combo' ? 'Montar' : 'Escolher';
  const effectiveAvailable = getEffectiveAvailability(product);
  const availableStock = getAvailableStock(product);
  const lowStockLabel = getLowStockLabel(product);

  const handleAdd = () => {
    if (mode === 'combo') { setComboOpen(true); return; }
    if (mode === 'flavors') { setFlavorOpen(true); return; }
    if (product.has_options) { setConfigOpen(true); return; }
    const quantityToAdd = availableStock !== null ? Math.min(quantity, availableStock) : quantity;
    for (let i = 0; i < quantityToAdd; i++) {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image_url: product.image_url,
        is_preorder: product.is_preorder,
        preorder_days: product.preorder_days,
        has_stock_control: product.has_stock_control,
        stock_quantity: product.stock_quantity,
      });
    }
    setQuantity(1);
    onOpenChange(false);
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh] rounded-t-3xl border-border/70 bg-card p-0 focus:outline-none">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{product.name}</DrawerTitle>
          </DrawerHeader>

          <div className="relative flex max-h-[88vh] flex-col overflow-hidden bg-card">
            {/* Close button */}
            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm border border-border/60 shadow-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            {product.image_url && !imgError ? (
              <div className="w-full flex-shrink-0 bg-muted/40 px-4 pt-2 pb-2 flex items-center justify-center" style={{ maxHeight: '240px' }}>
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="max-h-[220px] max-w-full rounded-2xl object-contain"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : (
              <div className="flex w-full flex-shrink-0 items-center justify-center bg-muted/40 text-5xl" style={{ height: '160px' }}>
                🍽️
              </div>
            )}

            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-card">
              <div className="space-y-4 p-5 text-left min-w-0">
                <div className="space-y-2 min-w-0">
                  <h2 className="text-2xl font-extrabold leading-tight text-foreground break-words">
                    {product.name}
                  </h2>

                  {product.is_preorder && product.preorder_days && product.preorder_days > 0 && (
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      <Clock className="h-3 w-3 flex-shrink-0" /> Encomenda — mín. {product.preorder_days} dia(s) de antecedência
                    </p>
                  )}

                  {lowStockLabel && (
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <AlertCircle className="h-3 w-3 flex-shrink-0" /> {lowStockLabel}
                    </p>
                  )}
                </div>

                {product.description && (
                  <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 min-w-0 overflow-hidden">
                    <p className="text-sm leading-6 text-muted-foreground whitespace-pre-line break-words overflow-wrap-anywhere" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      {product.description}
                    </p>
                  </div>
                )}

                <div className="pt-1 text-3xl font-extrabold text-primary">
                  {mode === 'combo' ? 'Monte o seu' : formatCurrency(product.price)}
                </div>
              </div>
            </div>

            <div
              className="border-t border-border/70 bg-card px-5 pt-4 pb-6 overflow-hidden"
              style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
            >
              {effectiveAvailable ? (
                <div className="flex items-center gap-3 min-w-0 w-full">
                  {!showChooseButton && (
                    <div className="flex flex-shrink-0 items-center overflow-hidden rounded-full border border-border bg-muted/40">
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 rounded-full p-0 hover:bg-primary/10" onClick={() => setQuantity(q => Math.max(1, q - 1))}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number" min={1} max={availableStock ?? undefined} value={quantity}
                        onChange={e => {
                          const n = parseInt(e.target.value, 10);
                          if (!isNaN(n) && n >= 1) setQuantity(availableStock !== null ? Math.min(n, availableStock) : n);
                        }}
                        className="h-11 w-12 rounded-none border-0 bg-transparent p-0 text-center text-sm font-bold [appearance:textfield] focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 rounded-full p-0 hover:bg-primary/10" onClick={() => setQuantity(q => availableStock !== null ? Math.min(availableStock, q + 1) : q + 1)} disabled={availableStock !== null && quantity >= availableStock}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <Button className="h-12 min-w-0 flex-1 rounded-2xl gap-2 text-base font-bold shadow-md shadow-primary/20 overflow-hidden" onClick={handleAdd}>
                    <ShoppingCart className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{showChooseButton ? chooseLabel : 'Adicionar ao carrinho'}</span>
                  </Button>
                </div>
              ) : (
                <span className="inline-block rounded-full bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive">
                  Indisponível
                </span>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {product.has_options && mode === 'normal' && (
        <ProductConfigModal product={product} open={configOpen} onOpenChange={setConfigOpen} />
      )}
      {mode === 'combo' && (
        <ComboConfigModal product={product as any} open={comboOpen} onOpenChange={setComboOpen} />
      )}
      {mode === 'flavors' && (
        <FlavorConfigModal product={product as any} open={flavorOpen} onOpenChange={setFlavorOpen} />
      )}
    </>
  );
}
