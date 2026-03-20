import { useState } from 'react';
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
import { Plus, Pencil, Trash2, Loader2, X, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/imageUtils';
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
import { ProductOptionGroupsEditor } from './ProductOptionGroupsEditor';
import { ComboItemsEditor } from './ComboItemsEditor';
import { FlavorItemsEditor } from './FlavorItemsEditor';
import { CrustOptionsEditor } from './CrustOptionsEditor';

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
  product_mode: string;
  combo_min_qty: string;
  combo_max_qty: string;
  flavor_count: string;
  flavor_price_rule: string;
  pizza_has_stuffed_crust: boolean;
}

const emptyForm: ProductForm = { name: '', description: '', price: '', category_id: '', available: true, is_preorder: false, preorder_days: '0', image_url: '', has_options: false, product_mode: 'normal', combo_min_qty: '', combo_max_qty: '', flavor_count: '2', flavor_price_rule: 'most_expensive', pizza_has_stuffed_crust: false };

const ITEMS_PER_PAGE = 7;

function SortableProductItem({
  product,
  categories,
  getModeLabel,
  onEdit,
  onDelete,
}: {
  product: any;
  categories: any[];
  getModeLabel: (mode: string) => string | null;
  onEdit: () => void;
  onDelete: () => void;
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
          {!product.available && ' • Indisponível'}
          {getCategoryName(product.category_id) && <span className="ml-1">• {getCategoryName(product.category_id)}</span>}
        </p>
      </div>
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
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        category_id: form.category_id || null,
        available: form.available,
        is_preorder: form.is_preorder,
        preorder_days: form.is_preorder ? parseInt(form.preorder_days) || 0 : 0,
        image_url: form.image_url || null,
        has_options: form.product_mode === 'normal' ? form.has_options : false,
        product_mode: form.product_mode,
        combo_min_qty: isCombo ? (parseInt(form.combo_min_qty) || 1) : null,
        combo_max_qty: isCombo && form.combo_max_qty ? (parseInt(form.combo_max_qty) || null) : null,
        flavor_count: isFlavors ? (parseInt(form.flavor_count) || 2) : null,
        flavor_price_rule: isFlavors ? form.flavor_price_rule : 'most_expensive',
        pizza_has_stuffed_crust: isFlavors ? form.pizza_has_stuffed_crust : false,
      };
      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
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
      product_mode: (p as any).product_mode || 'normal',
      combo_min_qty: String((p as any).combo_min_qty || ''),
      combo_max_qty: String((p as any).combo_max_qty || ''),
      flavor_count: String((p as any).flavor_count || 2),
      flavor_price_rule: (p as any).flavor_price_rule || 'most_expensive',
      pizza_has_stuffed_crust: (p as any).pizza_has_stuffed_crust || false,
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

              {/* Price — hidden hint for combo mode */}
              <div>
                <Label>Preço {form.product_mode === 'combo' ? '(não usado no combo)' : '*'}</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} className="rounded-xl" disabled={form.product_mode === 'combo'} />
                {form.product_mode === 'combo' && (
                  <p className="text-xs text-muted-foreground mt-1">No modo combo, o preço é calculado pela soma dos itens escolhidos.</p>
                )}
                {form.product_mode === 'flavors' && (
                  <p className="text-xs text-muted-foreground mt-1">No modo sabores, o preço é calculado pela regra de preço configurada abaixo.</p>
                )}
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
                <Switch checked={form.available} onCheckedChange={v => set('available', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Encomenda</Label>
                <Switch checked={form.is_preorder} onCheckedChange={v => set('is_preorder', v)} />
              </div>
              {form.is_preorder && (
                <div><Label>Dias de antecedência</Label><Input type="number" value={form.preorder_days} onChange={e => set('preorder_days', e.target.value)} className="rounded-xl" /></div>
              )}

              {/* Normal mode: has_options toggle */}
              {form.product_mode === 'normal' && (
                <div className="flex items-center justify-between">
                  <Label>Possui adicionais/opções?</Label>
                  <Switch checked={form.has_options} onCheckedChange={v => set('has_options', v)} />
                </div>
              )}

              {/* Combo mode config */}
              {form.product_mode === 'combo' && (
                <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
                  <h4 className="font-bold text-sm">Configuração do combo</h4>
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

            {/* Option groups editor — only for existing normal products with has_options */}
            {editing && form.product_mode === 'normal' && form.has_options && (
              <div className="mt-4">
                <ProductOptionGroupsEditor productId={editing} />
              </div>
            )}

            {/* Combo items editor — only for existing combo products */}
            {editing && form.product_mode === 'combo' && (
              <div className="mt-4">
                <ComboItemsEditor productId={editing} />
              </div>
            )}

            {/* Flavor items editor — only for existing flavor products */}
            {editing && form.product_mode === 'flavors' && (
              <div className="mt-4">
                <FlavorItemsEditor productId={editing} />
              </div>
            )}

            {/* Crust options editor — only for existing flavor products with stuffed crust enabled */}
            {editing && form.product_mode === 'flavors' && form.pizza_has_stuffed_crust && (
              <div className="mt-4">
                <CrustOptionsEditor productId={editing} />
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
    </div>
  );
}
