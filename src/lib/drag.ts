import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, HTMLAttributes } from 'react'

export type HandleProps = HTMLAttributes<HTMLButtonElement>

/**
 * Датчики перетягування: миша — після зсуву на 4 px (щоб клік лишався кліком),
 * палець — після короткого утримання (щоб звичайний свайп прокручував сторінку), клавіатура — стрілками.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/** Стан одного елемента, який можна перетягувати: стиль зсуву і властивості для ручки. */
export function useSortableItem(id: string, disabled = false) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 5 : undefined,
  }
  return { ref: setNodeRef, style, dragging: isDragging, handle: { ...attributes, ...listeners } as HandleProps }
}
