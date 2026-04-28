import { formatCurrency, formatDate, PAYMENT_METHODS } from '@/lib/format';

type AdminWhatsAppOrder = {
  address: string;
  address_number: string;
  change_amount: number | string | null;
  complement: string | null;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  delivery_fee: number | string;
  needs_change: boolean | null;
  neighborhood_name: string | null;
  order_number: number;
  payment_method: string;
  preorder_date: string | null;
  subtotal: number | string;
  total: number | string;
  notes?: string | null;
};

type AdminWhatsAppItem = {
  id: string;
  product_name: string;
  quantity: number;
  subtotal: number | string;
};

type AdminWhatsAppSelection = {
  group_name_snapshot: string | null;
  option_name_snapshot: string | null;
  order_item_id: string;
};

function formatPreorderDate(date: string) {
  const [year, month, day] = date.split('T')[0]?.split('-') ?? [];
  return year && month && day ? `${day}/${month}/${year}` : date;
}

export function buildAdminWhatsAppMessage({
  items,
  order,
  selections,
  storeName,
}: {
  items: AdminWhatsAppItem[];
  order: AdminWhatsAppOrder;
  selections: AdminWhatsAppSelection[];
  storeName: string;
}) {
  const hasName = storeName && storeName !== 'Meu Estabelecimento';
  const greeting = hasName ? `aqui é do estabelecimento *${storeName}*` : 'aqui é do *nosso estabelecimento*';

  const lines = [
    `Olá, ${greeting}! 😊`,
    '',
    'Recebemos seu pedido:',
    '',
    `📋 *Pedido #${order.order_number}*`,
    `📅 ${formatDate(order.created_at)}`,
  ];

  if (order.preorder_date) {
    lines.push(`📅 *Data da encomenda: ${formatPreorderDate(order.preorder_date)}*`);
  }

  lines.push('', '*Itens:*');

  items.forEach((item) => {
    lines.push(`${item.quantity}x ${item.product_name} - ${formatCurrency(Number(item.subtotal))}`);

    const grouped = selections
      .filter((selection) => selection.order_item_id === item.id)
      .reduce((acc, selection) => {
        const groupName = selection.group_name_snapshot || 'Opções';
        if (!acc[groupName]) acc[groupName] = [];
        acc[groupName].push(selection.option_name_snapshot || '');
        return acc;
      }, {} as Record<string, string[]>);

    Object.entries(grouped).forEach(([groupName, options]) => {
      // Count duplicates so combo selections like "5 Coxinhas" appear once with quantity
      const counts = options.reduce((acc, opt) => {
        if (opt) acc[opt] = (acc[opt] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const isCombo = groupName === 'Itens do Combo';
      const entries = Object.entries(counts);

      if (isCombo) {
        // One line per item in the combo for better readability
        entries.forEach(([name, qty]) => {
          lines.push(`  └ ${qty}x ${name}`);
        });
      } else {
        const formatted = entries.map(([name, qty]) => (qty > 1 ? `${qty}x ${name}` : name));
        lines.push(`  └ ${groupName}: ${formatted.join(', ')}`);
      }
    });
  });

  lines.push(
    '',
    `Subtotal: ${formatCurrency(Number(order.subtotal))}`,
    `Entrega: ${Number(order.delivery_fee) === 0 ? 'Grátis' : formatCurrency(Number(order.delivery_fee))}`,
    `*Total: ${formatCurrency(Number(order.total))}*`,
    `Pagamento: ${PAYMENT_METHODS[order.payment_method as keyof typeof PAYMENT_METHODS] || order.payment_method}`,
  );

  if (order.needs_change && order.change_amount) {
    lines.push(`Troco para: ${formatCurrency(Number(order.change_amount))}`);
  }

  lines.push('');

  if (order.address === 'Retirada no balcão') {
    lines.push('📍 *Retirada no balcão*');
  } else {
    lines.push('📍 *Entrega:*');
    lines.push(`${order.address}, ${order.address_number}${order.complement ? ` - ${order.complement}` : ''}`);

    if (order.neighborhood_name) {
      lines.push(order.neighborhood_name);
    }
  }

  if (order.notes && String(order.notes).trim()) {
    lines.push('', `📝 *Observações:* ${String(order.notes).trim()}`);
  }

  lines.push('', '✅ *Podemos confirmar?*');

  return lines.join('\n');
}