import { useSettings } from '@/hooks/useSettings';
import { ShoppingBag, MapPin, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface StoreHeaderProps {
  onTrackOrder?: () => void;
}

export function StoreHeader({ onTrackOrder }: StoreHeaderProps) {
  const { data: settings, isLoading } = useSettings();
  const name = settings?.business_name || '';
  const desc = settings?.business_description || '';
  const logoUrl = settings?.logo_url || '';
  const instagramUrl = settings?.instagram_url || '';
  const bannerUrl = settings?.banner_url || '';
  const hasBanner = !!bannerUrl;

  return (
    <header className={`relative overflow-hidden ${hasBanner ? 'bg-foreground' : 'bg-gradient-to-br from-primary/10 via-accent to-primary/5'}`}>
      {hasBanner && (
        <>
          <img
            src={bannerUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-black/45" />
        </>
      )}
      {!hasBanner && (
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmOTczMTYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iNCIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
      )}
      <div className="relative container mx-auto px-4 py-8 md:py-12">
        {/* Mobile: centered vertical layout */}
        <div className="flex flex-col items-center text-center md:hidden">
          {isLoading ? (
            <>
              <Skeleton className="h-24 w-24 rounded-3xl mb-4" />
              <Skeleton className="h-7 w-48 rounded-md mb-1.5" />
              <Skeleton className="h-4 w-36 rounded-md mb-4" />
            </>
          ) : (
            <>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={name}
                  className="h-24 w-24 rounded-3xl object-cover shadow-xl border-2 border-background/80 ring-2 ring-primary/15 mb-4"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary shadow-xl shadow-primary/25 mb-4">
                  <ShoppingBag className="h-10 w-10 text-primary-foreground" />
                </div>
              )}
              <h1 className={`text-2xl font-extrabold tracking-tight font-display leading-tight ${hasBanner ? 'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]' : 'text-foreground'}`}>
                {name}
              </h1>
              {desc && (
                <p className={`text-sm mt-1 max-w-[280px] ${hasBanner ? 'text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]' : 'text-muted-foreground'}`}>{desc}</p>
              )}
            </>
          )}
          <div className="flex items-center gap-2.5 mt-4">
            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-10 w-10 rounded-2xl border border-border/50 bg-background/60 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-sm"
              >
                <Instagram className="h-4.5 w-4.5" />
              </a>
            )}
            {onTrackOrder && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl gap-1.5 text-xs h-10 px-4 bg-background/60 shadow-sm"
                onClick={onTrackOrder}
              >
                <MapPin className="h-3.5 w-3.5" />
                Acompanhar pedido
              </Button>
            )}
          </div>
        </div>

        {/* Desktop: horizontal layout (unchanged logic) */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="h-14 w-14 rounded-2xl object-cover shadow-lg border border-border/30" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
                <ShoppingBag className="h-7 w-7 text-primary-foreground" />
              </div>
            )}
            <div>
              {isLoading ? (
                <>
                  <Skeleton className="h-7 w-48 rounded-md" />
                  <Skeleton className="h-4 w-32 mt-1 rounded-md" />
                </>
              ) : (
                <>
                  <h1 className={`text-2xl md:text-3xl font-extrabold tracking-tight font-display ${hasBanner ? 'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]' : 'text-foreground'}`}>{name}</h1>
                  {desc && <p className={`text-sm md:text-base mt-0.5 ${hasBanner ? 'text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]' : 'text-muted-foreground'}`}>{desc}</p>}
                </>
              )}
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
                Acompanhar pedido
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
