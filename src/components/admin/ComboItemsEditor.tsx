import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, Pencil, Check, X, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ComboItemsEditorProps {
  productId: string | null;
  comboPriceMode?: string;
}

export interface ComboItemsEditorHandle {
  persist: (productId: string) => Promise<void>;
  hasDraftData: () => boolean;
}

interface DraftItem {
  id?: string;
  name: string;
  price: number;
  sort_order: number;
  is_active?: boolean;
}

export const ComboItemsEditor = forwardRef<ComboItemsEditorHandle, ComboItemsEditorProps>(({ productId, comboPriceMode = 'items' }, ref) => {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // Local draft used when productId is null (new product flow)
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  const { data: dbItems = [], isLoading } = useQuery({
    queryKey: ['combo-items', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combo_items')
        .select('*')
        .eq('product_id', productId!)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const items: any[] = productId ? dbItems : draftItems;

  useImperativeHandle(ref, () => ({
    persist: async (newProductId: string) => {
      if (draftItems.length === 0) return;
      const { error } = await supabase.from('combo_items').insert(
        draftItems.map((it, idx) => ({
          product_id: newProductId,
          name: it.name.trim(),
          price: it.price || 0,
          sort_order: idx,
          is_active: it.is_active !== false,
        }))
      );
      if (error) throw error;
    },
    hasDraftData: () => draftItems.length > 0,
  }), [draftItems]);

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('combo_items').insert({
        product_id: productId!,
        name: newName.trim(),
        price: parseFloat(newPrice) || 0,
        sort_order: items.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combo-items', productId] });
      setNewName('');
      setNewPrice('');
      setShowForm(false);
      toast({ title: 'Item do combo adicionado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    if (productId) {
      addItem.mutate();
    } else {
      setDraftItems(prev => [...prev, {
        name: newName.trim(),
        price: parseFloat(newPrice) || 0,
        sort_order: prev.length,
      }]);
      setNewName('');
      setNewPrice('');
      setShowForm(false);
    }
  };

  const updateItem = useMutation({
    mutationFn: async ({ id, name, price }: { id: string; name: string; price: number }) => {
      const { error } = await supabase.from('combo_items').update({ name, price }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combo-items', productId] });
      setEditingId(null);
      toast({ title: 'Item atualizado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('combo_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combo-items', productId] });
      toast({ title: 'Item removido' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleRemove = (item: any, idx: number) => {
    if (productId) {
      removeItem.mutate(item.id);
    } else {
      setDraftItems(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id || `draft-${item.sort_order}`);
    setEditName(item.name);
    setEditPrice(String(item.price));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPrice('');
  };

  const saveEdit = (item: any, idx: number) => {
    if (!editName.trim()) return;
    if (productId) {
      updateItem.mutate({ id: item.id, name: editName.trim(), price: parseFloat(editPrice) || 0 });
    } else {
      setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, name: editName.trim(), price: parseFloat(editPrice) || 0 } : it));
      cancelEdit();
    }
  };

  const reorder = useMutation({
    mutationFn: async (newOrder: any[]) => {
      await Promise.all(
        newOrder.map((item, idx) =>
          supabase.from('combo_items').update({ sort_order: idx }).eq('id', item.id)
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combo-items', productId] });
    },
    onError: (err: any) => toast({ title: 'Erro ao reordenar', description: err.message, variant: 'destructive' }),
  });

  const moveItem = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    if (productId) {
      queryClient.setQueryData(['combo-items', productId], next);
      reorder.mutate(next);
    } else {
      setDraftItems(next.map((it, i) => ({ ...it, sort_order: i })));
    }
  };

  if (productId && isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
      <h4 className="font-bold text-sm">Itens do Combo</h4>
      <p className="text-xs text-muted-foreground">Cadastre os itens que compõem este combo.</p>
      {!productId && (
        <p className="text-[11px] text-muted-foreground">Os itens serão salvos automaticamente ao criar o produto.</p>
      )}

      {items.map((item, idx) => {
        const editKey = item.id || `draft-${idx}`;
        return (
          <div key={editKey} className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border/50">
            {editingId === editKey ? (
              <>
                <div className="flex-1 flex flex-col gap-1.5">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome" className="rounded-lg h-8 text-sm" />
                  {comboPriceMode === 'items' && (
                    <Input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="Preço" className="rounded-lg h-8 text-sm" />
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => saveEdit(item, idx)} disabled={!editName.trim() || updateItem.isPending}>
                  {updateItem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="Mover para cima">
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} title="Mover para baixo">
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <span className={`flex-1 text-sm font-medium truncate ${item.is_active === false ? 'text-muted-foreground line-through' : ''}`}>{item.name}</span>
                {comboPriceMode === 'items' && <span className="text-xs text-muted-foreground">R$ {Number(item.price).toFixed(2)}</span>}
                <Switch
                  checked={item.is_active !== false}
                  onCheckedChange={async (v) => {
                    if (productId && item.id) {
                      // Optimistic update
                      queryClient.setQueryData(['combo-items', productId], (old: any[] = []) =>
                        old.map(it => it.id === item.id ? { ...it, is_active: v } : it)
                      );
                      const { error } = await supabase.from('combo_items').update({ is_active: v }).eq('id', item.id);
                      if (error) {
                        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
                        queryClient.invalidateQueries({ queryKey: ['combo-items', productId] });
                      }
                    } else {
                      // Draft mode
                      setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, is_active: v } as any : it));
                    }
                  }}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => startEdit(item)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(item, idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        );
      })}

      {showForm ? (
        <div className="space-y-3 border border-border rounded-lg p-3 bg-card">
          <div>
            <Label className="text-xs">Nome do item</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Coxinha" className="rounded-lg h-8 text-sm" />
          </div>
          {comboPriceMode === 'items' && (
            <div>
              <Label className="text-xs">Preço</Label>
              <Input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0.00" className="rounded-lg h-8 text-sm" />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-8 rounded-lg flex-1" disabled={!newName.trim() || addItem.isPending} onClick={handleAdd}>
              {addItem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
            </Button>
            <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => { setShowForm(false); setNewName(''); setNewPrice(''); }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full h-8 rounded-lg text-xs gap-1" onClick={() => setShowForm(true)}>
          <Plus className="h-3 w-3" /> Adicionar item
        </Button>
      )}
    </div>
  );
});

ComboItemsEditor.displayName = 'ComboItemsEditor';
