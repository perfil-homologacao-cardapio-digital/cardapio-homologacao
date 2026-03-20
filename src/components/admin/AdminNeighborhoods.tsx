import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { toast } from '@/hooks/use-toast';

export function AdminNeighborhoods() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');

  const { data: neighborhoods = [] } = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('neighborhoods').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), delivery_fee: parseFloat(fee) || 0 };
      if (editing) {
        const { error } = await supabase.from('neighborhoods').update(payload).eq('id', editing);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('neighborhoods').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
      setOpen(false); setEditing(null); setName(''); setFee('');
      toast({ title: editing ? 'Bairro atualizado' : 'Bairro criado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('neighborhoods').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['neighborhoods'] }); toast({ title: 'Bairro removido' }); },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold">Bairros</h1>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setName(''); setFee(''); } }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl"><Plus className="h-4 w-4 mr-1" /> Novo Bairro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar Bairro' : 'Novo Bairro'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={name} onChange={e => setName(e.target.value)} className="rounded-xl" /></div>
              <div><Label>Taxa de entrega (R$)</Label><Input type="number" step="0.01" value={fee} onChange={e => setFee(e.target.value)} className="rounded-xl" /></div>
              <Button className="w-full rounded-xl" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {neighborhoods.map(n => (
          <div key={n.id} className="flex items-center justify-between bg-card border border-border/50 rounded-xl p-3">
            <div>
              <span className="font-semibold text-sm">{n.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{formatCurrency(n.delivery_fee)}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setName(n.name); setFee(String(n.delivery_fee)); setEditing(n.id); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(n.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        {neighborhoods.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum bairro cadastrado</p>}
      </div>
    </div>
  );
}
