"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";

type DragHandleProps = Record<string, unknown>;

function SortRow({
  id,
  render,
}: {
  id: string;
  render: (opts: { dragHandleProps: DragHandleProps }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Only attach drag listeners to this handle (NOT the whole row)
  const dragHandleProps = {
    ...attributes,
    ...listeners,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {render({ dragHandleProps })}
    </div>
  );
}

export default function DragList<T extends { id: string }>({
  items,
  setItems,
  render,
  onPersist,
}: {
  items: T[];
  setItems: (next: T[]) => void;
  render: (item: T, opts: { dragHandleProps: DragHandleProps }) => React.ReactNode;
  onPersist: (next: T[]) => Promise<void>;
}) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);

  // Add a small activation distance so clicks don't accidentally start dragging
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={async ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIndex = ids.indexOf(String(active.id));
        const newIndex = ids.indexOf(String(over.id));
        const next = arrayMove(items, oldIndex, newIndex);
        setItems(next);
        await onPersist(next);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortRow
            key={item.id}
            id={item.id}
            render={({ dragHandleProps }) => render(item, { dragHandleProps })}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
