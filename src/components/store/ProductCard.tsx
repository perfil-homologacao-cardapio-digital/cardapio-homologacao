import { useState, memo, useCallback, lazy, Suspense } from 'react';
import { Plus, Minus, Clock, AlertCircle, ShoppingCart, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { cn } from '@/lib/utils';
import { getAvailableStock, getEffectiveAvailability, getLowStockLabel } from '@/lib/stock';
import { getOptimizedImageUrl, getImageSrcSet } from '@/lib/imageUrl';

const ProductConfigModal = lazy(() => import('./ProductConfigModal').then(m => ({ default: m.ProductConfigModal })));
const ComboConfigModal = lazy(() => import('./ComboConfigModal').then(m => ({ default: m.ComboConfigModal })));
const FlavorConfigModal = lazy(() => import('./FlavorConfigModal').then(m => ({ default: m.FlavorConfigModal })));
const ProductDetailModal = lazy(() => import('./ProductDetailModal').then(m => ({ default: m.ProductDetailModal })));

interface ProductCardProps {
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
    has_variations?: boolean;
    product_mode?: string;
    combo_min_qty?: number | null;
    combo_max_qty?: number | null;
    flavor_count?: number | null;
    flavor_price_rule?: string | null;
    has_stock_control?: boolean;
    stock_quantity?: number | null;
    price_display_mode?: string;
  };
  priority?: boolean;
}

export const ProductCard = memo(function ProductCard({ product, priority = false }: ProductCardProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [configOpen, setConfigOpen] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [flavorOpen, setFlavorOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const handleImgLoad = useCallback(() => setImgLoaded(true), []);

  const mode = product.product_mode || 'normal';
  const effectiveAvailable = getEffectiveAvailability(product);
  const availableStock = getAvailableStock(product);
  const lowStockLabel = getLowStockLabel(product);
  const hasVariations = (product as any).has_variations === true;
  const needsConfig = product.has_options || hasVariations;

  const handleAdd = () => {
    if (mode === 'combo') {
      setComboOpen(true);
      return;
    }
    if (mode === 'flavors') {
      setFlavorOpen(true);
      return;
    }
    if (needsConfig) {
      setConfigOpen(true);
      return;
    }
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
  };

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1) {
      setQuantity(availableStock !== null ? Math.min(num, availableStock) : num);
    } else if (value === '') {
      setQuantity(1);
    }
  };

  const showChooseButton = mode === 'combo' || mode === 'flavors' || needsConfig;
  const chooseLabel = mode === 'combo' ? 'Montar' : mode === 'flavors' ? 'Escolher' : 'Escolher';

  return (
    <>
      <div className={cn(
        "group relative flex gap-3 p-3 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-all overflow-hidden",
        !effectiveAvailable && "opacity-60"
      )}>
        <div className="relative flex-shrink-0 w-24 h-24 md:w-28 md:h-28 rounded-lg overflow-hidden bg-muted">
          {product.image_url && !imgError ? (
            <>
              {!imgLoaded && (
                <div className="absolute inset-0 animate-pulse bg-muted" />
              )}
              <img
                src={getOptimizedImageUrl(product.image_url, { width: 224, quality: 65 })}
                srcSet={getImageSrcSet(product.image_url, [112, 224, 336], 65) || undefined}
                sizes="(min-width: 768px) 112px, 96px"
                alt={product.name}
                width={112}
                height={112}
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={priority ? "high" : "low"}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-300",
                  imgLoaded ? "opacity-100" : "opacity-0"
                )}
                onLoad={handleImgLoad}
                onError={() => setImgError(true)}
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-3xl">🍽️</div>
          )}
          {product.is_preorder && (
            <div className="absolute top-1 left-1 flex items-center gap-1 bg-warning/90 text-warning-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              <Clock className="h-3 w-3" /> Encomenda
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 min-w-0 justify-between overflow-hidden">
          <div className="min-w-0">
            <h3 className="font-bold text-sm md:text-base text-foreground leading-tight truncate">{product.name}</h3>
            {product.description && (
              <div className="mt-0.5 min-w-0">
                <p className="text-xs text-muted-foreground line-clamp-2 break-words overflow-hidden">{product.description}</p>
                {product.description.length > 80 && (
                  <button
                    type="button"
                    onClick={() => setDetailOpen(true)}
                    className="text-[10px] text-primary font-semibold flex items-center gap-0.5 mt-0.5 hover:underline"
                  >
                    Ver mais <ChevronDown className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            {product.is_preorder && product.preorder_days && product.preorder_days > 0 && (
              <p className="text-xs text-warning flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" /> Mín. {product.preorder_days} dia(s) de antecedência
              </p>
            )}
            {lowStockLabel && (
              <p className="text-xs text-warning flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" /> {lowStockLabel}
              </p>
            )}
          </div>
          <div className="flex flex-col mt-2 gap-1.5 min-w-0">
            <span className="text-base font-extrabold text-primary">
              {mode === 'combo' && (product as any).combo_price_mode !== 'fixed'
                ? 'Monte o seu'
                : (product.price_display_mode === 'starting_from'
                    ? <><span className="text-[10px] font-semibold text-muted-foreground mr-1">A partir de</span>{formatCurrency(product.price)}</>
                    : formatCurrency(product.price))}
            </span>
            {effectiveAvailable ? (
              showChooseButton ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="rounded-full h-8 px-4 shadow-md shadow-primary/20 gap-1 text-xs shrink-0"
                    onClick={handleAdd}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> {chooseLabel}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-1">
                  <div className="flex items-center border border-border rounded-full overflow-hidden bg-muted/50">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full p-0 hover:bg-primary/10" onClick={() => setQuantity(q => Math.max(1, q - 1))}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number" min={1} max={availableStock ?? undefined} value={quantity}
                      onChange={e => handleQuantityChange(e.target.value)}
                      className="h-7 w-9 text-center text-xs font-bold border-0 bg-transparent p-0 rounded-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full p-0 hover:bg-primary/10" onClick={() => setQuantity(q => availableStock !== null ? Math.min(availableStock, q + 1) : q + 1)} disabled={availableStock !== null && quantity >= availableStock}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button size="sm" className="rounded-full h-8 px-3 shadow-md shadow-primary/20 gap-1 text-xs shrink-0" onClick={handleAdd}>
                    <ShoppingCart className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            ) : (
              <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded-full self-end">Indisponível</span>
            )}
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        {detailOpen && (
          <ProductDetailModal
            product={product}
            open={detailOpen}
            onOpenChange={setDetailOpen}
          />
        )}

        {needsConfig && mode === 'normal' && configOpen && (
          <ProductConfigModal
            product={product}
            open={configOpen}
            onOpenChange={setConfigOpen}
          />
        )}

        {mode === 'combo' && comboOpen && (
          <ComboConfigModal
            product={product as any}
            open={comboOpen}
            onOpenChange={setComboOpen}
          />
        )}

        {mode === 'flavors' && flavorOpen && (
          <FlavorConfigModal
            product={product as any}
            open={flavorOpen}
            onOpenChange={setFlavorOpen}
          />
        )}
      </Suspense>
    </>
  );
});
