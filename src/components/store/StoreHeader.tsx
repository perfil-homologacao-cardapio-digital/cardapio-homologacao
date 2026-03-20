import { useSettings } from '@/hooks/useSettings';
import { ShoppingBag, MapPin, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StoreHeaderProps {
  onTrackOrder?: () => void;
}

export function StoreHeader({ onTrackOrder }: StoreHeaderProps) {
  const { data: settings } = useSettings();
  const name = settings?.business_name || 'Delícias da Casa';
  const desc = settings?.business_description || '';
  const logoUrl = settings?.logo_url || '';
  const instagramUrl = settings?.instagram_url || '';

  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-accent to-primary/5">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmOTczMTYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iNCIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
      <div className="relative container mx-auto px-4 py-8 md:py-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="h-14 w-14 rounded-2xl object-cover shadow-lg border border-border/30" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
                <ShoppingBag className="h-7 w-7 text-primary-foreground" />
              </div>
            )}
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground font-display">{name}</h1>
              {desc && <p className="text-sm md:text-base text-muted-foreground mt-0.5">{desc}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
            )}
            {onTrackOrder && (
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={onTrackOrder}>
                <MapPin className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Acompanhar pedido</span>
                <span className="sm:hidden">Pedido</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
