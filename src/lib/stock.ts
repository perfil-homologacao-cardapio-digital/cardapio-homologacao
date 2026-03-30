export interface StockControlledLike {
  available?: boolean | null;
  has_stock_control?: boolean | null;
  stock_quantity?: number | string | null;
}

export function normalizeStockQuantity(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function getAvailableStock(product: StockControlledLike): number | null {
  if (!product?.has_stock_control) return null;
  return normalizeStockQuantity(product.stock_quantity);
}

export function getEffectiveAvailability(product: StockControlledLike): boolean {
  const stockQuantity = getAvailableStock(product);
  if (stockQuantity !== null) return stockQuantity > 0;
  return product?.available !== false;
}

export function getLowStockLabel(product: StockControlledLike): string | null {
  const stockQuantity = getAvailableStock(product);
  if (stockQuantity === null || stockQuantity <= 0 || stockQuantity > 5) return null;
  return stockQuantity === 1
    ? 'Última unidade em estoque'
    : `Últimas ${stockQuantity} unidades em estoque`;
}