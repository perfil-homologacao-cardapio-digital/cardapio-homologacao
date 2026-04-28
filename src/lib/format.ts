export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export const ORDER_STATUSES = {
  new: { label: 'Novo', color: 'bg-primary text-primary-foreground' },
  preparing: { label: 'Preparando', color: 'bg-warning text-warning-foreground' },
  ready: { label: 'Pronto', color: 'bg-success text-success-foreground' },
  out_for_delivery: { label: 'Saiu p/ entrega', color: 'bg-blue-500 text-white' },
  delivered: { label: 'Entregue', color: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelado', color: 'bg-destructive text-destructive-foreground' },
} as const;

export const PAYMENT_METHODS = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit: 'Cartão de Crédito',
  debit: 'Cartão de Débito',
} as const;

export const PAYMENT_STATUSES = {
  pending: { label: 'Aguardando pagamento', color: 'bg-warning text-warning-foreground' },
  paid: { label: 'Pago', color: 'bg-success text-success-foreground' },
  failed: { label: 'Pagamento recusado', color: 'bg-destructive text-destructive-foreground' },
} as const;
