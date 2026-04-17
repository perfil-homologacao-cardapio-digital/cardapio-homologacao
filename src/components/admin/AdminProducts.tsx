import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Loader2, X, ChevronLeft, ChevronRight, GripVertical, Link2, Copy } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/imageUtils';
import { getEffectiveAvailability, normalizeStockQuantity } from '@/lib/stock';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
import { ProductOptionGroupsEditor, ProductOptionGroupsEditorHandle } from './ProductOptionGroupsEditor';
import { ProductVariationsEditor, ProductVariationsEditorHandle } from './ProductVariationsEditor';
import { ComboItemsEditor, ComboItemsEditorHandle } from './ComboItemsEditor';
import { FlavorItemsEditor, FlavorItemsEditorHandle } from './FlavorItemsEditor';
import { CrustOptionsEditor, CrustOptionsEditorHandle } from './CrustOptionsEditor';

interface ProductForm {
  name: string;
  description: string;
  price: string;
  category_id: string;
  available: boolean;
  is_preorder: boolean;
  preorder_days: string;
  image_url: string;
  has_options: boolean;
  has_variations: boolean;
  product_mode: string;
  combo_min_qty: string;
  combo_max_qty: string;
  flavor_count: string;
  flavor_price_rule: string;
  pizza_has_stuffed_crust: boolean;
  has_stock_control: boolean;
  stock_quantity: string;
  combo_price_mode: string;
  price_display_mode: string;
}

const emptyForm: ProductForm = { name: '', description: '', price: '', category_id: '', available: true, is_preorder: false, preorder_days: '0', image_url: '', has_options: false, has_variations: false, product_mode: 'normal', combo_min_qty: '', combo_max_qty: '', flavor_count: '2', flavor_price_rule: 'most_expensive', pizza_has_stuffed_crust: false, has_stock_control: false, stock_quantity: '0', combo_price_mode: 'items', price_display_mode: 'fixed' };

const ITEMS_PER_PAGE = 7;

function SortableProductItem({
  product,
  categories,
  getModeLabel,
  onEdit,
  onDelete,
  onCopyLink,
  onDuplicate,
}: {
  product: any;
  categories: any[];
  getModeLabel: (mode: string) => string | null;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const getCategoryName = (catId: string | null) => {
    if (!catId) return null;
    return categories.find(c => c.id === catId)?.name || null;
  };
  const effectiveAvailable = getEffectiveAvailability(product);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-card border border-border/50 rounded-xl p-3">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none flex-shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
        {product.image_url ? <img src={product.image_url} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
        {!product.image_url && <div className="w-full h-full flex items-center justify-center text-lg">🍽️</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">
          {product.name}
          {product.has_options && <span className="text-[10px] text-muted-foreground font-normal ml-1">• com opções</span>}
          {getModeLabel(product.product_mode) && <span className="text-[10px] text-muted-foreground font-normal ml-1">• {getModeLabel(product.product_mode)}</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(product.price)}
          {!effectiveAvailable && ' • Indisponível'}
          {product.has_stock_control && <span className="ml-1">• Estoque: {product.stock_quantity}</span>}
          {getCategoryName(product.category_id) && <span className="ml-1">• {getCategoryName(product.category_id)}</span>}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Copiar link do produto" onClick={onCopyLink}><Link2 className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Duplicar produto" onClick={onDuplicate}><Copy className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

export function AdminProducts() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  // Refs to persist child editor drafts after creating a new product
  const optionGroupsRef = useRef<ProductOptionGroupsEditorHandle>(null);
  const comboChoiceGroupsRef = useRef<ProductOptionGroupsEditorHandle>(null);
  const variationsRef = useRef<ProductVariationsEditorHandle>(null);
  const comboItemsRef = useRef<ComboItemsEditorHandle>(null);
  const flavorItemsRef = useRef<FlavorItemsEditorHandle>(null);
  const crustOptionsRef = useRef<CrustOptionsEditorHandle>(null);

  // Realtime: auto-refresh products when stock changes via sales
  useEffect(() => {
    const channel = supabase
      .channel('admin-products-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['products'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const filteredProducts = filterCategory === 'all'
    ? products
    : products.filter(p => p.category_id === filterCategory);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  // Reset page when filter changes or out of bounds
  const handleFilterChange = (v: string) => {
    setFilterCategory(v);
    setPage(0);
  };

  if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));

  const save = useMutation({
    mutationFn: async () => {
      const isCombo = form.product_mode === 'combo';
      const isFlavors = form.product_mode === 'flavors';
      const stockQuantity = form.has_stock_control ? normalizeStockQuantity(form.stock_quantity) : 0;
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        category_id: form.category_id || null,
        available: form.has_stock_control ? stockQuantity > 0 : form.available,
        is_preorder: form.is_preorder,
        preorder_days: form.is_preorder ? parseInt(form.preorder_days) || 0 : 0,
        image_url: form.image_url || null,
        has_options: form.product_mode === 'normal' ? form.has_options : false,
        has_variations: form.product_mode === 'normal' ? form.has_variations : false,
        product_mode: form.product_mode,
        combo_min_qty: isCombo ? (parseInt(form.combo_min_qty) || 1) : null,
        combo_max_qty: isCombo && form.combo_max_qty ? (parseInt(form.combo_max_qty) || null) : null,
        flavor_count: isFlavors ? (parseInt(form.flavor_count) || 2) : null,
        flavor_price_rule: isFlavors ? form.flavor_price_rule : 'most_expensive',
        pizza_has_stuffed_crust: isFlavors ? form.pizza_has_stuffed_crust : false,
        has_stock_control: form.has_stock_control,
        stock_quantity: stockQuantity,
        combo_price_mode: isCombo ? form.combo_price_mode : 'items',
        price_display_mode: form.price_display_mode || 'fixed',
      };
      let targetId: string;
      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing);
        if (error) throw error;
        targetId = editing;
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) throw error;
        targetId = data.id;
      }
      // Persist nested editors for both new and existing products
      try {
        if (form.product_mode === 'normal' && form.has_options) {
          await optionGroupsRef.current?.persist(targetId);
        }
        if (form.product_mode === 'normal' && form.has_variations) {
          await variationsRef.current?.persist(targetId);
        }
        if (form.product_mode === 'combo') {
          await comboItemsRef.current?.persist(targetId);
          await comboChoiceGroupsRef.current?.persist(targetId);
        }
        if (form.product_mode === 'flavors') {
          await flavorItemsRef.current?.persist(targetId);
          if (form.pizza_has_stuffed_crust) {
            await crustOptionsRef.current?.persist(targetId);
          }
        }
      } catch (err: any) {
        toast({ title: editing ? 'Produto salvo, mas falhou ao salvar itens' : 'Produto criado, mas falhou ao salvar itens', description: err.message, variant: 'destructive' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['combo-items'] });
      queryClient.invalidateQueries({ queryKey: ['flavor-items'] });
      queryClient.invalidateQueries({ queryKey: ['crust-options'] });
      queryClient.invalidateQueries({ queryKey: ['product-option-groups'] });
      queryClient.invalidateQueries({ queryKey: ['product-variations'] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast({ title: editing ? 'Produto atualizado' : 'Produto criado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteId(null);
      toast({ title: 'Produto removido' });
    },
    onError: (err: any) => {
      setDeleteId(null);
      toast({ title: 'Erro ao excluir', description: err.message || 'Não foi possível excluir o produto. Ele pode estar vinculado a pedidos.', variant: 'destructive' });
    },
  });

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      // 1. Fetch original product
      const { data: original, error: prodErr } = await supabase.from('products').select('*').eq('id', id).single();
      if (prodErr) throw prodErr;
      const { id: _omit, created_at, updated_at, ...rest } = original as any;
      const newProductPayload = { ...rest, name: `${original.name} (cópia)` };
      const { data: newProd, error: insErr } = await supabase.from('products').insert(newProductPayload).select('id').single();
      if (insErr) throw insErr;
      const newProductId = newProd.id;

      // 2. Duplicate option groups + their options
      const { data: groups } = await supabase.from('product_option_groups').select('*').eq('product_id', id);
      if (groups && groups.length > 0) {
        for (const g of groups as any[]) {
          const { id: gid, created_at: _c, updated_at: _u, ...gRest } = g;
          const { data: newGroup, error: gErr } = await supabase
            .from('product_option_groups')
            .insert({ ...gRest, product_id: newProductId })
            .select('id')
            .single();
          if (gErr) throw gErr;
          const { data: opts } = await supabase.from('product_options').select('*').eq('group_id', gid);
          if (opts && opts.length > 0) {
            const newOpts = (opts as any[]).map(({ id: _i, created_at: _c2, updated_at: _u2, group_id: _g, ...oRest }) => ({
              ...oRest,
              group_id: newGroup.id,
            }));
            const { error: oErr } = await supabase.from('product_options').insert(newOpts);
            if (oErr) throw oErr;
          }
        }
      }

      // 3. Duplicate combo_items
      const { data: comboItems } = await supabase.from('combo_items').select('*').eq('product_id', id);
      if (comboItems && comboItems.length > 0) {
        const newItems = (comboItems as any[]).map(({ id: _i, created_at: _c, updated_at: _u, product_id: _p, ...rest }) => ({
          ...rest,
          product_id: newProductId,
        }));
        const { error } = await supabase.from('combo_items').insert(newItems);
        if (error) throw error;
      }

      // 4. Duplicate flavor_items
      const { data: flavorItems } = await supabase.from('flavor_items').select('*').eq('product_id', id);
      if (flavorItems && flavorItems.length > 0) {
        const newItems = (flavorItems as any[]).map(({ id: _i, created_at: _c, updated_at: _u, product_id: _p, ...rest }) => ({
          ...rest,
          product_id: newProductId,
        }));
        const { error } = await supabase.from('flavor_items').insert(newItems);
        if (error) throw error;
      }

      // 5. Duplicate pizza_crust_options
      const { data: crustOpts } = await supabase.from('pizza_crust_options' as any).select('*').eq('product_id', id);
      if (crustOpts && (crustOpts as any[]).length > 0) {
        const newItems = (crustOpts as any[]).map(({ id: _i, created_at: _c, updated_at: _u, product_id: _p, ...rest }) => ({
          ...rest,
          product_id: newProductId,
        }));
        const { error } = await supabase.from('pizza_crust_options' as any).insert(newItems as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['combo-items'] });
      queryClient.invalidateQueries({ queryKey: ['flavor-items'] });
      queryClient.invalidateQueries({ queryKey: ['crust-options'] });
      queryClient.invalidateQueries({ queryKey: ['product-option-groups'] });
      setDuplicateId(null);
      toast({ title: 'Produto duplicado com sucesso' });
    },
    onError: (err: any) => {
      setDuplicateId(null);
      toast({ title: 'Erro ao duplicar', description: err.message, variant: 'destructive' });
    },
  });

  const handleEdit = (p: typeof products[0]) => {
    setForm({
      name: p.name,
      description: p.description || '',
      price: String(p.price),
      category_id: p.category_id || '',
      available: p.available,
      is_preorder: p.is_preorder,
      preorder_days: String(p.preorder_days || 0),
      image_url: p.image_url || '',
      has_options: p.has_options,
      has_variations: (p as any).has_variations || false,
      product_mode: (p as any).product_mode || 'normal',
      combo_min_qty: String((p as any).combo_min_qty || ''),
      combo_max_qty: String((p as any).combo_max_qty || ''),
      flavor_count: String((p as any).flavor_count || 2),
      flavor_price_rule: (p as any).flavor_price_rule || 'most_expensive',
      pizza_has_stuffed_crust: (p as any).pizza_has_stuffed_crust || false,
      has_stock_control: (p as any).has_stock_control || false,
      stock_quantity: String((p as any).stock_quantity || 0),
      combo_price_mode: (p as any).combo_price_mode || 'items',
      price_display_mode: (p as any).price_display_mode || 'fixed',
    });
    setEditing(p.id);
    setOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'Arquivo muito grande', description: 'O tamanho máximo é 2 MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('product-images').upload(path, compressed);
      if (error) {
        toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
        setUploading(false);
        return;
      }
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      setForm(prev => ({ ...prev, image_url: data.publicUrl }));
    } catch (err: any) {
      toast({ title: 'Erro ao comprimir imagem', description: err.message, variant: 'destructive' });
    }
    setUploading(false);
  };

  const handleRemoveImage = () => {
    setForm(prev => ({ ...prev, image_url: '' }));
  };

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const getCategoryName = (catId: string | null) => {
    if (!catId) return null;
    return categories.find(c => c.id === catId)?.name || null;
  };

  const getModeLabel = (mode: string) => {
    if (mode === 'combo') return '📦 Combo';
    if (mode === 'flavors') return '🍕 Sabores';
    return null;
  };

  const handleProductDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredProducts.findIndex(p => p.id === active.id);
    const newIndex = filteredProducts.findIndex(p => p.id === over.id);
    const reordered = arrayMove(filteredProducts, oldIndex, newIndex);

    // Optimistic update on full products list
    const newProducts = products.map(p => {
      const idx = reordered.findIndex(r => r.id === p.id);
      return idx >= 0 ? { ...p, sort_order: idx } : p;
    });
    queryClient.setQueryData(['products'], newProducts);

    // Persist
    const updates = reordered.map((p, i) => supabase.from('products').update({ sort_order: i }).eq('id', p.id));
    await Promise.all(updates);
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold">Produtos</h1>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl"><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} className="rounded-xl" /></div>
              <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => set('description', e.target.value)} className="rounded-xl" /></div>

              {/* Mode selector */}
              <div>
                <Label>Modo do produto</Label>
                <Select value={form.product_mode} onValueChange={v => set('product_mode', v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="combo">Combo por quantidade</SelectItem>
                    <SelectItem value="flavors">Sabores (ex: pizza)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Price — conditional for combo mode */}
              <div>
                <Label>Preço {form.product_mode === 'combo' && form.combo_price_mode === 'items' ? '(não usado no combo)' : '*'}</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} className="rounded-xl" disabled={form.product_mode === 'combo' && form.combo_price_mode === 'items'} />
                {form.product_mode === 'combo' && form.combo_price_mode === 'items' && (
                  <p className="text-xs text-muted-foreground mt-1">No modo combo com preço nos itens, o preço é calculado pela soma dos itens escolhidos.</p>
                )}
                {form.product_mode === 'combo' && form.combo_price_mode === 'fixed' && (
                  <p className="text-xs text-muted-foreground mt-1">Preço fixo do combo. Os itens servem apenas para composição.</p>
                )}
                {form.product_mode === 'flavors' && (
                  <p className="text-xs text-muted-foreground mt-1">No modo sabores, o preço é calculado pela regra de preço configurada abaixo.</p>
                )}
              </div>

              {/* Price display mode — visual only */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label>Exibir como "A partir de"</Label>
                  <span className="text-[11px] text-muted-foreground">Apenas visual. Não altera o cálculo.</span>
                </div>
                <Switch
                  checked={form.price_display_mode === 'starting_from'}
                  onCheckedChange={v => set('price_display_mode', v ? 'starting_from' : 'fixed')}
                />
              </div>

              <div>
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={v => set('category_id', v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Imagem</Label>
                <Input type="file" accept="image/*" onChange={handleImageUpload} className="rounded-xl" />
                {uploading && <Loader2 className="h-4 w-4 animate-spin mt-1" />}
                {form.image_url && (
                  <div className="flex items-center gap-2 mt-2">
                    <img src={form.image_url} className="w-20 h-20 rounded-lg object-cover" />
                    <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg text-xs gap-1" onClick={handleRemoveImage}>
                      <X className="h-3 w-3" /> Remover imagem
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label>Disponível</Label>
                <Switch checked={form.has_stock_control ? normalizeStockQuantity(form.stock_quantity) > 0 : form.available} onCheckedChange={v => set('available', v)} disabled={form.has_stock_control} />
              </div>
              {form.has_stock_control && (
                <p className="text-xs text-muted-foreground -mt-2">Com estoque ativo, a disponibilidade é sincronizada automaticamente pela quantidade em estoque.</p>
              )}
              <div className="flex items-center justify-between">
                <Label>Encomenda</Label>
                <Switch checked={form.is_preorder} onCheckedChange={v => set('is_preorder', v)} />
              </div>
              {form.is_preorder && (
                <div><Label>Dias de antecedência</Label><Input type="number" value={form.preorder_days} onChange={e => set('preorder_days', e.target.value)} className="rounded-xl" /></div>
              )}

              {/* Stock control */}
              <div className="flex items-center justify-between">
                <Label>Produto com estoque</Label>
                <Switch checked={form.has_stock_control} onCheckedChange={v => set('has_stock_control', v)} />
              </div>
              {form.has_stock_control && (
                <div>
                  <Label>Quantidade em estoque *</Label>
                  <Input type="number" min={0} value={form.stock_quantity} onChange={e => set('stock_quantity', e.target.value)} className="rounded-xl" placeholder="Ex: 50" />
                  <p className="text-xs text-muted-foreground mt-1">Ao zerar, o produto ficará indisponível automaticamente.</p>
                </div>
              )}

              {/* Normal mode: variations + addons toggles */}
              {form.product_mode === 'normal' && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <Label>Possui variações? (tamanhos/versões)</Label>
                      <span className="text-[11px] text-muted-foreground">Substituem o preço base.</span>
                    </div>
                    <Switch checked={form.has_variations} onCheckedChange={v => set('has_variations', v)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <Label>Possui adicionais/opções?</Label>
                      <span className="text-[11px] text-muted-foreground">Somam ao preço.</span>
                    </div>
                    <Switch checked={form.has_options} onCheckedChange={v => set('has_options', v)} />
                  </div>
                </>
              )}

              {/* Combo mode config */}
              {form.product_mode === 'combo' && (
                <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
                  <h4 className="font-bold text-sm">Configuração do combo</h4>
                  <div>
                    <Label className="text-xs">Precificação do Combo</Label>
                    <Select value={form.combo_price_mode} onValueChange={v => set('combo_price_mode', v)}>
                      <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Preço Fechado</SelectItem>
                        <SelectItem value="items">Preço nos Itens</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Quantidade mínima *</Label>
                      <Input type="number" min={1} value={form.combo_min_qty} onChange={e => set('combo_min_qty', e.target.value)} className="rounded-lg" placeholder="Ex: 15" />
                    </div>
                    <div>
                      <Label className="text-xs">Quantidade máxima</Label>
                      <Input type="number" min={1} value={form.combo_max_qty} onChange={e => set('combo_max_qty', e.target.value)} className="rounded-lg" placeholder="Opcional" />
                    </div>
                  </div>
                </div>
              )}

              {/* Flavors mode config */}
              {form.product_mode === 'flavors' && (
                <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
                  <h4 className="font-bold text-sm">Configuração de sabores</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Qtd. de sabores *</Label>
                      <Input type="number" min={1} value={form.flavor_count} onChange={e => set('flavor_count', e.target.value)} className="rounded-lg" placeholder="Ex: 2" />
                    </div>
                    <div>
                      <Label className="text-xs">Regra de preço</Label>
                      <Select value={form.flavor_price_rule} onValueChange={v => set('flavor_price_rule', v)}>
                        <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="most_expensive">Sabor mais caro</SelectItem>
                          <SelectItem value="average">Média dos sabores</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <Label className="text-xs">Oferecer borda recheada</Label>
                    <Switch checked={form.pizza_has_stuffed_crust} onCheckedChange={v => set('pizza_has_stuffed_crust', v)} />
                  </div>
                </div>
              )}

              <Button className="w-full rounded-xl" onClick={() => save.mutate()} disabled={save.isPending || !form.name || (form.product_mode === 'normal' && !form.price)}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>

            {/* Variations editor — render BEFORE addons */}
            {form.product_mode === 'normal' && form.has_variations && (
              <div className="mt-4">
                <ProductVariationsEditor ref={variationsRef} productId={editing} />
              </div>
            )}

            {/* Option groups editor — available immediately, even before save */}
            {form.product_mode === 'normal' && form.has_options && (
              <div className="mt-4">
                <ProductOptionGroupsEditor ref={optionGroupsRef} productId={editing} />
              </div>
            )}

            {/* Combo items editor — available immediately, even before save */}
            {form.product_mode === 'combo' && (
              <div className="mt-4">
                <ComboItemsEditor ref={comboItemsRef} productId={editing} comboPriceMode={form.combo_price_mode} />
              </div>
            )}

            {/* Combo choice blocks (e.g. "Escolha seu refrigerante") — admin section */}
            {form.product_mode === 'combo' && (
              <div className="mt-4">
                <ProductOptionGroupsEditor
                  ref={comboChoiceGroupsRef}
                  productId={editing}
                  groupKind="combo_choice"
                  hidePrice
                  title="Blocos de escolha do combo"
                  newButtonLabel="Novo bloco de escolha"
                  emptyText="Nenhum bloco de escolha. Use para deixar o cliente escolher itens (ex: refrigerante)."
                  titlePlaceholder="Ex: Escolha seu refrigerante"
                />
              </div>
            )}

            {/* Flavor items editor — available immediately, even before save */}
            {form.product_mode === 'flavors' && (
              <div className="mt-4">
                <FlavorItemsEditor ref={flavorItemsRef} productId={editing} />
              </div>
            )}

            {/* Crust options editor — available immediately when stuffed crust is enabled */}
            {form.product_mode === 'flavors' && form.pizza_has_stuffed_crust && (
              <div className="mt-4">
                <CrustOptionsEditor ref={crustOptionsRef} productId={editing} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Category filter */}
      <div className="mb-4">
        <Select value={filterCategory} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-48 rounded-xl">
            <SelectValue placeholder="Filtrar por categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProductDragEnd}>
        <SortableContext items={paginatedProducts.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {paginatedProducts.map(p => (
              <SortableProductItem
                key={p.id}
                product={p}
                categories={categories}
                getModeLabel={getModeLabel}
                onEdit={() => handleEdit(p)}
                onDelete={() => setDeleteId(p.id)}
                onDuplicate={() => setDuplicateId(p.id)}
                onCopyLink={() => {
                  const baseUrl = window.location.origin;
                  const link = `${baseUrl}/?product=${p.id}`;
                  navigator.clipboard.writeText(link).then(() => {
                    toast({ title: 'Link copiado!', description: 'O link do produto foi copiado para a área de transferência.' });
                  });
                }}
              />
            ))}
            {filteredProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum produto encontrado</p>}
          </div>
        </SortableContext>
      </DndContext>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => (
            <Button
              key={i}
              variant={page === i ? 'default' : 'outline'}
              size="sm"
              className="h-8 w-8 rounded-lg p-0 text-xs"
              onClick={() => setPage(i)}
            >
              {i + 1}
            </Button>
          ))}
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O produto será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Duplicate confirmation dialog */}
      <AlertDialog open={!!duplicateId} onOpenChange={(open) => { if (!open) setDuplicateId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicar produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Você realmente deseja duplicar este produto? Uma cópia completa será criada, incluindo adicionais, itens de combo, sabores e bordas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => duplicateId && duplicate.mutate(duplicateId)}>
              {duplicate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
