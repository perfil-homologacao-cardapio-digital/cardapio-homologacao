import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CartProvider, useCart } from '@/lib/cart';
import { StoreHeader } from '@/components/store/StoreHeader';
import { CategoryNav } from '@/components/store/CategoryNav';
import { ProductCard } from '@/components/store/ProductCard';
import { CartDrawer, CartSidebar } from '@/components/store/CartDrawer';
import { CheckoutForm } from '@/components/store/CheckoutForm';
import { OrderTracker } from '@/components/store/OrderTracker';
import { ProductDetailModal } from '@/components/store/ProductDetailModal';
import { getEffectiveAvailability } from '@/lib/stock';

function StoreContent() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showTracker, setShowTracker] = useState(false);
  const { itemCount } = useCart();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deepLinkProduct, setDeepLinkProduct] = useState<any>(null);
  const [deepLinkOpen, setDeepLinkOpen] = useState(false);
  const deepLinkHandled = useRef(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('sort_order');
      if (error) throw error;
      return (data || []).map(product => ({
        ...product,
        available: getEffectiveAvailability(product),
      }));
    },
  });

  // Deep link: open product modal from ?product=ID
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const productId = searchParams.get('product');
    if (!productId || products.length === 0) return;

    const found = products.find(p => p.id === productId);
    if (found) {
      setDeepLinkProduct(found);
      setDeepLinkOpen(true);
    }
    // Remove param from URL to prevent re-trigger
    deepLinkHandled.current = true;
    searchParams.delete('product');
    setSearchParams(searchParams, { replace: true });
  }, [products, searchParams, setSearchParams]);

  const handleDeepLinkClose = useCallback((open: boolean) => {
    setDeepLinkOpen(open);
    if (!open) setDeepLinkProduct(null);
  }, []);

  const handleCheckout = useCallback(() => setShowCheckout(true), []);
  const handleBack = useCallback(() => setShowCheckout(false), []);

  const { groupedProducts, uncategorized, priorityIds } = useMemo(() => {
    const isAll = activeCategory === 'all';
    // Categories marked as unavailable hide their products from the menu
    const unavailableCatIds = new Set(
      (categories as any[]).filter(c => c.is_available === false).map(c => c.id)
    );
    const visibleProducts = (products as any[]).filter(p => !p.category_id || !unavailableCatIds.has(p.category_id));
    const filtered = isAll ? visibleProducts : visibleProducts.filter(p => p.category_id === activeCategory);
    const visibleCategories = (categories as any[]).filter(c => c.is_available !== false);
    const grouped = visibleCategories
      .map(cat => ({ ...cat, products: filtered.filter(p => p.category_id === cat.id) }))
      .filter(cat => cat.products.length > 0);
    const uncat = filtered.filter(p => !p.category_id);
    // First 4 visible products get priority loading
    const allVisible = [...grouped.flatMap(c => c.products), ...uncat];
    const pIds = new Set(allVisible.slice(0, 4).map(p => p.id));
    return { groupedProducts: grouped, uncategorized: uncat, priorityIds: pIds };
  }, [products, categories, activeCategory]);

  const hasResults = groupedProducts.length > 0 || uncategorized.length > 0;

  if (showCheckout) {
    return <CheckoutForm onBack={handleBack} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <StoreHeader onTrackOrder={() => setShowTracker(true)} />
      <CategoryNav
        categories={(categories as any[]).filter(c => c.is_available !== false)}
        active={activeCategory}
        onSelect={setActiveCategory}
      />
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          <div className="flex-1 space-y-8">
            {groupedProducts.map(cat => (
              <section key={cat.id} id={`cat-${cat.id}`}>
                <h2 className="text-lg font-extrabold mb-3 text-foreground">{cat.name}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cat.products.map(product => (
                    <ProductCard key={product.id} product={product} priority={priorityIds.has(product.id)} />
                  ))}
                </div>
              </section>
            ))}
            {uncategorized.length > 0 && (
              <section>
                <h2 className="text-lg font-extrabold mb-3 text-foreground">Outros</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {uncategorized.map(product => (
                    <ProductCard key={product.id} product={product} priority={priorityIds.has(product.id)} />
                  ))}
                </div>
              </section>
            )}
            {!hasResults && products.length > 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-lg font-semibold">Nenhum produto encontrado nesta categoria.</p>
              </div>
            )}
            {products.length === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-4xl mb-3">🍽️</p>
                <p className="text-lg font-semibold">Nenhum produto disponível no momento</p>
                <p className="text-sm">Volte em breve!</p>
              </div>
            )}
          </div>
          <div className="w-80 flex-shrink-0 hidden md:block">
            <CartSidebar onCheckout={handleCheckout} />
          </div>
        </div>
      </div>
      <CartDrawer onCheckout={handleCheckout} />
      <OrderTracker open={showTracker} onOpenChange={setShowTracker} />
      {deepLinkProduct && (
        <ProductDetailModal
          product={deepLinkProduct}
          open={deepLinkOpen}
          onOpenChange={handleDeepLinkClose}
        />
      )}
    </div>
  );
}

export default function StorePage() {
  return (
    <CartProvider>
      <StoreContent />
    </CartProvider>
  );
}
