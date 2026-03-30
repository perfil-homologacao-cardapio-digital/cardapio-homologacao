import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { normalizeStockQuantity } from '@/lib/stock';

export interface CartItemSelection {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price: number;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
  is_preorder?: boolean;
  preorder_days?: number | null;
  selections?: CartItemSelection[];
  has_stock_control?: boolean;
  stock_quantity?: number | null;
  cartKey?: string;
}

function generateCartKey(item: Omit<CartItem, 'quantity' | 'cartKey'>): string {
  const selKey = item.selections?.map(s => s.option_id).sort().join(',') || '';
  return `${item.id}__${selKey}`;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity' | 'cartKey'>) => void;
  removeItem: (cartKey: string) => void;
  updateQuantity: (cartKey: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
  hasPreorderItems: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: Omit<CartItem, 'quantity' | 'cartKey'>) => {
    const cartKey = generateCartKey(item);
    const maxStock = item.has_stock_control ? normalizeStockQuantity(item.stock_quantity) : null;
    let blockedMessage: string | null = null;

    setItems(prev => {
      const totalForProduct = prev.reduce((sum, current) => current.id === item.id ? sum + current.quantity : sum, 0);

      if (maxStock !== null && totalForProduct >= maxStock) {
        blockedMessage = maxStock === 0
          ? 'Estoque finalizado'
          : `Quantidade indisponível. Restam ${Math.max(0, maxStock - totalForProduct)} unidade(s) em estoque.`;
        return prev;
      }

      const existing = prev.find(i => i.cartKey === cartKey);
      if (existing) {
        return prev.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        ...item,
        has_stock_control: item.has_stock_control === true,
        stock_quantity: maxStock,
        quantity: 1,
        cartKey,
      }];
    });

    if (blockedMessage) {
      toast({ title: 'Estoque limitado', description: blockedMessage, variant: 'destructive', duration: 2500 });
      return;
    }

    toast({ title: 'Item adicionado ao carrinho', duration: 2000 });
  }, []);

  const removeItem = useCallback((cartKey: string) => {
    setItems(prev => prev.filter(i => i.cartKey !== cartKey));
  }, []);

  const updateQuantity = useCallback((cartKey: string, quantity: number) => {
    let blockedMessage: string | null = null;

    setItems(prev => {
      const target = prev.find(i => i.cartKey === cartKey);
      if (!target) return prev;

      if (quantity <= 0) {
        return prev.filter(i => i.cartKey !== cartKey);
      }

      let nextQuantity = quantity;
      if (target.has_stock_control) {
        const maxStock = normalizeStockQuantity(target.stock_quantity);
        const otherQty = prev.reduce((sum, current) => {
          if (current.id !== target.id || current.cartKey === cartKey) return sum;
          return sum + current.quantity;
        }, 0);
        const allowedForLine = Math.max(0, maxStock - otherQty);

        if (allowedForLine <= 0) {
          blockedMessage = 'Estoque finalizado';
          nextQuantity = 0;
        } else if (quantity > allowedForLine) {
          blockedMessage = allowedForLine === 1
            ? 'Quantidade indisponível. Resta 1 unidade em estoque.'
            : `Quantidade indisponível. Restam ${allowedForLine} unidades em estoque.`;
          nextQuantity = allowedForLine;
        }
      }

      if (nextQuantity <= 0) {
        return prev.filter(i => i.cartKey !== cartKey);
      }

      return prev.map(i => i.cartKey === cartKey ? { ...i, quantity: nextQuantity } : i);
    });

    if (blockedMessage) {
      toast({ title: 'Estoque limitado', description: blockedMessage, variant: 'destructive', duration: 2500 });
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const hasPreorderItems = items.some(i => i.is_preorder);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, subtotal, itemCount, hasPreorderItems }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
