# Skeleton Components

Componentes de skeleton para estados de carga en VoiceCommand.

## Uso

```tsx
import { 
  ContactCardSkeleton, 
  KanbanBoardSkeleton, 
  DashboardSkeleton 
} from '../skeletons';

// En tu componente:
{loading && <ContactCardSkeleton />}
```

## Componentes

### ContactCardSkeleton
Skeleton que replica exactamente el ContactCard.

```tsx
<ContactCardSkeleton pulse={true} />
<ContactCardListSkeleton count={5} />
```

### KanbanColumnSkeleton
Skeleton para una columna del Kanban.

```tsx
<KanbanColumnSkeleton 
  color="#a855f7"
  accentBg="rgba(168, 85, 247, 0.08)"
  cardCount={5}
/>

<KanbanBoardSkeleton columnCount={7} cardsPerColumn={3} />
```

### DashboardSkeleton
Skeleton completo para dashboard.

```tsx
<DashboardSkeleton />
```

## Características

- ✅ Animaciones pulse suaves
- ✅ Colores púrpuras del tema
- ✅ Responsive
- ✅ Accesibles (aria-hidden)
- ✅ Reduced motion support
