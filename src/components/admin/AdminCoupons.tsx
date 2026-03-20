import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Coupon = {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order_value: number | null;
  is_active: boolean;
  created_at: string;
};

export function AdminCoupons() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', type: 'percentage', value: '', min_order_value: '', is_active: true });

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const { data, error } = await supabase.from('discount_coupons' as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as Coupon[];
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ code: '', type: 'percentage', value: '', min_order_value: '', is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      min_order_value: c.min_order_value != null ? String(c.min_order_value) : '',
      is_active: c.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast({ title: 'Código obrigatório', variant: 'destructive' }); return; }
    if (!form.value || parseFloat(form.value) <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }

    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: parseFloat(form.value),
      min_order_value: form.min_order_value ? parseFloat(form.min_order_value) : null,
      is_active: form.is_active,
    };

    if (editing) {
      const { error } = await supabase.from('discount_coupons' as any).update(payload as any).eq('id', editing.id);
      if (error) { toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Cupom atualizado' });
    } else {
      const { error } = await supabase.from('discount_coupons' as any).insert(payload as any);
      if (error) { toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Cupom criado' });
    }

    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('discount_coupons' as any).delete().eq('id', deleteId);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Cupom excluído' });
    setDeleteId(null);
    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  };

  const toggleActive = async (c: Coupon) => {
    await supabase.from('discount_coupons' as any).update({ is_active: !c.is_active } as any).eq('id', c.id);
    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-extrabold">Cupons de Desconto</h2>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo Cupom</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : coupons.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhum cupom cadastrado.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Pedido Mín.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.code}</TableCell>
                  <TableCell>{c.type === 'percentage' ? 'Porcentagem' : 'Valor fixo'}</TableCell>
                  <TableCell>{c.type === 'percentage' ? `${c.value}%` : formatCurrency(c.value)}</TableCell>
                  <TableCell>{c.min_order_value != null ? formatCurrency(c.min_order_value) : '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={c.is_active ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleActive(c)}
                    >
                      {c.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Código *</Label>
              <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="DESCONTO10" className="rounded-xl font-mono" />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.type === 'percentage' ? 'Porcentagem do desconto (%) *' : 'Valor do desconto (R$) *'}</Label>
              <Input type="number" step="0.01" min="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder={form.type === 'percentage' ? 'Ex: 10 (%)' : 'Ex: 10,00 (R$)'} className="rounded-xl" />
            </div>
            <div>
              <Label>Valor mínimo do pedido (opcional)</Label>
              <Input type="number" step="0.01" min="0" value={form.min_order_value} onChange={e => setForm(p => ({ ...p, min_order_value: e.target.value }))} placeholder="Deixe vazio para não exigir" className="rounded-xl" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
            </div>
            <Button onClick={handleSave} className="w-full rounded-xl">{editing ? 'Salvar' : 'Criar Cupom'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
