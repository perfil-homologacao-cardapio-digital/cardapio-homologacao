import { ShoppingCart, Minus, Plus, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart, type CartItem } from '@/lib/cart';
import { useStoreOpen } from '@/hooks/useStoreOpen';
import { formatCurrency } from '@/lib/format';
import { normalizeStockQuantity } from '@/lib/stock';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';

interface CartDrawerProps {
  onCheckout: () => void;
}

export function CartDrawer({ onCheckout }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, subtotal, itemCount } = useCart();
  const { isOpen: storeIsOpen } = useStoreOpen();
  const allPreorder = items.length > 0 && items.every(i => i.is_preorder);
  const canCheckout = storeIsOpen || allPreorder;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="fixed bottom-[70px] right-6 z-50 h-14 w-14 rounded-full shadow-xl md:hidden" size="icon" style={{ backgroundColor: '#E53935' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#C62828')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#E53935')}>
          <ShoppingCart className="h-6 w-6 text-white" />
          {itemCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center text-white border-0" style={{ backgroundColor: '#B71C1C' }}>
              {itemCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="text-lg font-bold">Seu Pedido</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CartContents items={items} updateQuantity={updateQuantity} removeItem={removeItem} subtotal={subtotal} />
        </div>
        {itemCount > 0 && (
          <div className="flex-shrink-0 pt-2 border-t border-border/50">
            {!canCheckout && (
              <div className="flex items-center gap-2 bg-destructive/10 rounded-lg p-2 mb-2">
                <Clock className="h-4 w-4 text-destructive" />
                <span className="text-xs text-destructive font-medium">Loja fechada no momento</span>
              </div>
            )}
            <Button className="w-full h-12 rounded-xl font-bold text-base" onClick={onCheckout} disabled={!canCheckout}>
              {canCheckout ? `Finalizar Pedido — ${formatCurrency(subtotal)}` : 'Loja Fechada'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CartSidebar({ onCheckout }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, subtotal, itemCount } = useCart();
  const { isOpen: storeIsOpen } = useStoreOpen();
  const allPreorder = items.length > 0 && items.every(i => i.is_preorder);
  const canCheckout = storeIsOpen || allPreorder;

  return (
    <div className="hidden md:flex flex-col sticky top-20 bg-card border border-border rounded-2xl shadow-sm p-5 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" /> Seu Pedido
        {itemCount > 0 && <Badge variant="secondary" className="ml-auto">{itemCount}</Badge>}
      </h2>
      <CartContents items={items} updateQuantity={updateQuantity} removeItem={removeItem} subtotal={subtotal} />
      {itemCount > 0 && (
        <>
          {!canCheckout && (
            <div className="flex items-center gap-2 bg-destructive/10 rounded-lg p-2 mt-2">
              <Clock className="h-4 w-4 text-destructive" />
              <span className="text-xs text-destructive font-medium">Loja fechada no momento</span>
            </div>
          )}
          <Button className="w-full mt-4 h-12 rounded-xl font-bold text-base" onClick={onCheckout} disabled={!canCheckout}>
            {canCheckout ? 'Finalizar Pedido' : 'Loja Fechada'}
          </Button>
        </>
      )}
    </div>
  );
}

function CartContents({ items, updateQuantity, removeItem, subtotal }: {
  items: CartItem[];
  updateQuantity: (cartKey: string, q: number) => void;
  removeItem: (cartKey: string) => void;
  subtotal: number;
}) {
  if (!items.length) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Seu carrinho está vazio</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 flex-1 overflow-y-auto">
      {items.map(item => (
        (() => {
          const totalForProduct = items.reduce((sum, current) => current.id === item.id ? sum + current.quantity : sum, 0);
          const maxStock = item.has_stock_control ? normalizeStockQuantity(item.stock_quantity) : null;
          const otherQty = totalForProduct - item.quantity;
          const maxForLine = maxStock !== null ? Math.max(0, maxStock - otherQty) : null;
          const plusDisabled = maxForLine !== null && item.quantity >= maxForLine;

          return (
        <div key={item.cartKey} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{item.name}</p>
            {item.selections && item.selections.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {Object.entries(
                  item.selections.reduce((acc, s) => {
                    if (!acc[s.group_name]) acc[s.group_name] = [];
                    acc[s.group_name].push(s.option_name);
                    return acc;
                  }, {} as Record<string, string[]>)
                ).map(([groupName, opts]) => {
                  // Contar ocorrências de cada item
                  const counts = opts.reduce((countAcc, opt) => {
                    countAcc[opt] = (countAcc[opt] || 0) + 1;
                    return countAcc;
                  }, {} as Record<string, number>);
                  // Formatar com quantidade
                  const formatted = Object.entries(counts).map(([name, count]) =>
                    count > 1 ? `${count}x ${name}` : name
                  );
                  return (
                    <p key={groupName} className="text-[10px] text-muted-foreground">
                      {groupName}: {formatted.join(', ')}
                    </p>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{formatCurrency(item.price)}</p>
            {item.has_stock_control && maxStock !== null && maxStock <= 5 && (
              <p className="text-[10px] text-warning mt-0.5">
                {maxStock === 1 ? 'Última unidade em estoque' : `Últimas ${maxStock} unidades em estoque`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(item.cartKey!, item.quantity - 1)}>
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(item.cartKey!, item.quantity + 1)} disabled={plusDisabled}>
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.cartKey!)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <span className="text-sm font-bold w-16 text-right">{formatCurrency(item.price * item.quantity)}</span>
        </div>
          );
        })()
      ))}
      <div className="flex justify-between pt-2 font-bold">
        <span>Subtotal</span>
        <span className="text-primary">{formatCurrency(subtotal)}</span>
      </div>
    </div>
  );
}
