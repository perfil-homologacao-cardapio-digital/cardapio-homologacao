import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/hooks/useSettings';
import AdminLogin from '@/pages/AdminLogin';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminOrders } from '@/components/admin/AdminOrders';
import { AdminProducts } from '@/components/admin/AdminProducts';
import { AdminCategories } from '@/components/admin/AdminCategories';
import { AdminNeighborhoods } from '@/components/admin/AdminNeighborhoods';
import { AdminCoupons } from '@/components/admin/AdminCoupons';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminPaymentAutomation } from '@/components/admin/AdminPaymentAutomation';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Package, ListOrdered, Tags, MapPin, Settings, LogOut, Bell, Menu, X, Ticket, Zap, Sun, Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAdminTheme } from '@/hooks/useAdminTheme';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'orders', label: 'Pedidos', icon: ListOrdered },
  { key: 'products', label: 'Produtos', icon: Package },
  { key: 'categories', label: 'Categorias', icon: Tags },
  { key: 'neighborhoods', label: 'Bairros', icon: MapPin },
  { key: 'coupons', label: 'Cupons', icon: Ticket },
  { key: 'payment-automation', label: 'Pagamentos Automatizados', icon: Zap },
  { key: 'settings', label: 'Configurações', icon: Settings },
];


// Hand bell being shaken rapidly: "dlem dlem dlem dlem"
function playBellSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;

    // Master gain + compressor for maximum loudness without distortion
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, t);
    compressor.knee.setValueAtTime(0, t);
    compressor.ratio.setValueAtTime(20, t);
    compressor.attack.setValueAtTime(0.003, t);
    compressor.release.setValueAtTime(0.05, t);
    compressor.connect(ctx.destination);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(3.0, t);
    masterGain.connect(compressor);

    function strike(when: number, intensity: number) {
      // Bright bell fundamental ~2200Hz (higher pitch = more attention-grabbing)
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.connect(g1);
      g1.connect(masterGain);
      o1.type = 'sine';
      o1.frequency.setValueAtTime(2200, when);
      o1.frequency.exponentialRampToValueAtTime(2100, when + 0.15);
      g1.gain.setValueAtTime(intensity * 0.8, when);
      g1.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
      o1.start(when);
      o1.stop(when + 0.15);

      // Upper harmonic ~4400Hz for sharp metallic ring
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.connect(g2);
      g2.connect(masterGain);
      o2.type = 'sine';
      o2.frequency.setValueAtTime(4400, when);
      g2.gain.setValueAtTime(intensity * 0.35, when);
      g2.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
      o2.start(when);
      o2.stop(when + 0.1);

      // Mid harmonic ~3300Hz
      const o3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      o3.connect(g3);
      g3.connect(masterGain);
      o3.type = 'sine';
      o3.frequency.setValueAtTime(3300, when);
      g3.gain.setValueAtTime(intensity * 0.4, when);
      g3.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
      o3.start(when);
      o3.stop(when + 0.12);

      // Sharp click for clapper impact
      const bufSize = ctx.sampleRate * 0.006;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      const noise = ctx.createBufferSource();
      const ng = ctx.createGain();
      noise.buffer = buf;
      noise.connect(ng);
      ng.connect(masterGain);
      ng.gain.setValueAtTime(intensity * 0.5, when);
      ng.gain.exponentialRampToValueAtTime(0.001, when + 0.01);
      noise.start(when);
      noise.stop(when + 0.01);
    }

    // Rapid shaking pattern: 6 quick strikes
    const strikes = [
      { offset: 0,    intensity: 0.9 },
      { offset: 0.1,  intensity: 1.0 },
      { offset: 0.2,  intensity: 0.8 },
      { offset: 0.32, intensity: 1.0 },
      { offset: 0.44, intensity: 0.85 },
      { offset: 0.56, intensity: 0.7 },
    ];
    strikes.forEach(s => strike(t + s.offset, s.intensity));

    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

export default function AdminPage() {
  const { user, loading, signOut } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const queryClient = useQueryClient();
  const knownOrderIds = useRef<Set<string>>(new Set());
  const bellIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { data: settings } = useSettings();
  const soundEnabled = settings?.sound_alert !== 'false';
  const { isDark, toggle: toggleTheme } = useAdminTheme();

  // Fetch initial orders to populate known IDs
  const { data: orders } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as (typeof data[number] & { opened_at: string | null })[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (orders) {
      orders.forEach(o => knownOrderIds.current.add(o.id));
    }
  }, [orders]);

  // Calculate unviewed new orders count (based on DB opened_at)
  const unviewedCount = orders
    ? orders.filter(o => !o.opened_at).length
    : 0;

  // Mark order as viewed in DB
  const handleOrderViewed = useCallback(async (orderId: string) => {
    const { error } = await supabase.from('orders').update({ opened_at: new Date().toISOString() } as any).eq('id', orderId);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    }
  }, [queryClient]);

  // Sound loop: play bell every 4s when on orders tab with unviewed orders and sound enabled
  useEffect(() => {
    const shouldPlay = tab === 'orders' && unviewedCount > 0 && soundEnabled;

    if (shouldPlay) {
      // Play immediately
      playBellSound();
      // Then loop
      bellIntervalRef.current = setInterval(() => {
        playBellSound();
      }, 4000);
    }

    return () => {
      if (bellIntervalRef.current) {
        clearInterval(bellIntervalRef.current);
        bellIntervalRef.current = null;
      }
    };
  }, [tab, unviewedCount, soundEnabled]);

  // Realtime subscription for new orders
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const newId = payload.new.id as string;
        if (!knownOrderIds.current.has(newId)) {
          knownOrderIds.current.add(newId);
          queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!user) return <AdminLogin />;

  const handleTabChange = (key: string) => {
    setTab(key);
    setMobileNav(false);
  };

  // Badge count: use unviewedCount (orders not yet opened via eye icon)
  const badgeCount = unviewedCount;

  return (
    <div className="min-h-screen bg-background flex" translate="no">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Package className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-extrabold text-lg">Admin</span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={isDark ? 'Tema claro' : 'Tema escuro'}
            className="ml-auto h-8 w-8 rounded-lg border border-border bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => handleTabChange(item.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                tab === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.key === 'orders' && badgeCount > 0 && (
                <Badge className="ml-auto bg-destructive text-destructive-foreground h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">{badgeCount}</Badge>
              )}
            </button>
          ))}
        </nav>
        <Button variant="ghost" onClick={signOut} className="justify-start gap-3 text-muted-foreground mt-auto">
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <button onClick={() => setMobileNav(true)} className="p-1"><Menu className="h-5 w-5" /></button>
        <span className="font-extrabold">Admin</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="relative">
            {badgeCount > 0 && <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[8px] bg-destructive rounded-full flex items-center justify-center">{badgeCount}</Badge>}
            <Bell className="h-5 w-5 text-muted-foreground" onClick={() => handleTabChange('orders')} />
          </div>
        </div>
      </div>

      {/* Mobile nav overlay */}
      {mobileNav && (
        <div className="md:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setMobileNav(false)}>
          <aside className="w-64 h-full bg-card border-r border-border p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <span className="font-extrabold text-lg">Menu</span>
              <button onClick={() => setMobileNav(false)}><X className="h-5 w-5" /></button>
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.key}
                  onClick={() => handleTabChange(item.key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    tab === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-4 w-4" /> {item.label}
                  {item.key === 'orders' && badgeCount > 0 && (
                    <Badge className="ml-auto bg-destructive h-5 w-5 p-0 text-[10px] rounded-full flex items-center justify-center">{badgeCount}</Badge>
                  )}
                </button>
              ))}
            </nav>
            <Button variant="ghost" onClick={signOut} className="w-full justify-start gap-3 text-muted-foreground mt-8">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:p-6 p-4 pt-16 md:pt-6 overflow-y-auto">
        {tab === 'dashboard' && <AdminDashboard />}
        {tab === 'orders' && <AdminOrders onOrderViewed={handleOrderViewed} />}
        {tab === 'products' && <AdminProducts />}
        {tab === 'categories' && <AdminCategories />}
        {tab === 'neighborhoods' && <AdminNeighborhoods />}
        {tab === 'coupons' && <AdminCoupons />}
        {tab === 'payment-automation' && <AdminPaymentAutomation />}
        {tab === 'settings' && <AdminSettings />}
      </main>
    </div>
  );
}
