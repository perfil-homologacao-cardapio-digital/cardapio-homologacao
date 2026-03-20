import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FlavorItemsEditorProps {
  productId: string;
}

export function FlavorItemsEditor({ productId }: FlavorItemsEditorProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['flavor-items', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flavor_items')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('flavor_items').insert({
        product_id: productId,
        name: newName.trim(),
        price: parseFloat(newPrice) || 0,
        sort_order: items.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavor-items', productId] });
      setNewName('');
      setNewPrice('');
      setShowForm(false);
      toast({ title: 'Sabor adicionado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('flavor_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavor-items', productId] });
      toast({ title: 'Sabor removido' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
      <h4 className="font-bold text-sm">Sabores</h4>
      <p className="text-xs text-muted-foreground">Cadastre os sabores disponíveis para este produto.</p>

      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border/50">
          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
          <span className="text-xs text-muted-foreground">R$ {Number(item.price).toFixed(2)}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem.mutate(item.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {showForm ? (
        <div className="space-y-3 border border-border rounded-lg p-3 bg-card">
          <div>
            <Label className="text-xs">Nome do sabor</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Calabresa" className="rounded-lg h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Preço</Label>
            <Input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0.00" className="rounded-lg h-8 text-sm" />
          </div>
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
          <Plus className="h-3 w-3" /> Adicionar sabor
        </Button>
      )}
    </div>
  );
}
