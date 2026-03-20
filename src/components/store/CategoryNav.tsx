import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CategoryNavProps {
  categories: { id: string; name: string }[];
  active: string | null;
  onSelect: (id: string) => void;
}

export function CategoryNav({ categories, active, onSelect }: CategoryNavProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !active) return;
    const el = ref.current.querySelector(`[data-cat="${active}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  if (!categories.length) return null;

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
      <div ref={ref} className="container mx-auto px-4 flex gap-2 py-3 overflow-x-auto scrollbar-hide">
        <button
          data-cat="all"
          onClick={() => onSelect('all')}
          className={cn(
            "flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all",
            active === 'all'
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-secondary text-secondary-foreground hover:bg-primary/10"
          )}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            data-cat={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all",
              active === cat.id
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "bg-secondary text-secondary-foreground hover:bg-primary/10"
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}
