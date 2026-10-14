'use client';
// Minimal @dnd-kit vertical sortable list used by Category Order and the Home Builder sections list.
import type { CSSProperties, ReactNode } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface HandleProps { [k: string]: any }

function Row({ id, children }: { id: string; children: (handle: HandleProps, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: 'relative', opacity: isDragging ? 0.6 : 1 };
  return <div ref={setNodeRef} style={style}>{children({ ...attributes, ...listeners }, isDragging)}</div>;
}

/** <SortableList items={rows} onReorder={setRows} render={(row, handle) => <div><span {...handle}>⋮⋮</span>…</div>} /> */
export function SortableList<T extends { id: string }>({ items, onReorder, render, className = 'space-y-2' }: {
  items: T[]; onReorder: (next: T[]) => void; render: (item: T, handle: HandleProps, index: number, dragging: boolean) => ReactNode; className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((it, i) => <Row key={it.id} id={it.id}>{(h, d) => render(it, h, i, d)}</Row>)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
