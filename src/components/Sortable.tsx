import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDragSensors, type HandleProps } from '../lib/drag'

/** Ручка, за яку тягнуть рядок. */
export function DragHandle({ label, ...props }: HandleProps & { label: string }) {
  return (
    <button
      type="button"
      className="icon-btn drag-handle"
      aria-label={label}
      title="Перетягни, щоб змінити порядок"
      {...props}
    >
      <GripVertical size={15} />
    </button>
  )
}

type ListProps<T> = {
  items: T[]
  getId: (item: T) => string
  onReorder: (next: T[]) => void
  children: (item: T, index: number) => ReactNode
}

/** Простий список, що впорядковується перетягуванням (матеріали, питання тесту тощо). */
export function SortableList<T>({ items, getId, onReorder, children }: ListProps<T>) {
  const sensors = useDragSensors()
  const ids = items.map(getId)

  function end({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder(next)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => children(item, i))}
      </SortableContext>
    </DndContext>
  )
}
