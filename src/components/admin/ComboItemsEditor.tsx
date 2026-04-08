import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Loader2, GripVertical, Pencil, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ComboItemsEditorProps {
  productId: string;
  comboPriceMode?: string;
}

export function ComboItemsEditor({ productId, comboPriceMode = 'items' }: ComboItemsEditorProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['combo-items', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combo_items')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('combo_items').insert({
        product_id: productId,
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

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPrice(String(item.price));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPrice('');
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateItem.mutate({ id: editingId, name: editName.trim(), price: parseFloat(editPrice) || 0 });
  };

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
      <h4 className="font-bold text-sm">Itens do Combo</h4>
      <p className="text-xs text-muted-foreground">Cadastre os itens que compõem este combo. O preço final será a soma dos itens escolhidos pelo cliente.</p>

      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border/50">
          {editingId === item.id ? (
            <>
              <div className="flex-1 flex flex-col gap-1.5">
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome" className="rounded-lg h-8 text-sm" />
                {comboPriceMode === 'items' && (
                  <Input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="Preço" className="rounded-lg h-8 text-sm" />
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={saveEdit} disabled={!editName.trim() || updateItem.isPending}>
                {updateItem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit}>
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
              {comboPriceMode === 'items' && <span className="text-xs text-muted-foreground">R$ {Number(item.price).toFixed(2)}</span>}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => startEdit(item)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem.mutate(item.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      ))}

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
            <Button size="sm" className="h-8 rounded-lg flex-1" disabled={!newName.trim() || addItem.isPending} onClick={() => addItem.mutate()}>
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
}
