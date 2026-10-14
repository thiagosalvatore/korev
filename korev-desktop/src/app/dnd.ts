import { useState, type DragEvent } from 'react';

export const WORKSPACE_DRAG_TYPE = 'application/x-korev-workspace';
export const ASK_DRAG_TYPE = 'application/x-korev-ask';
export const FILE_DRAG_TYPE = 'application/x-korev-file';

export type DropHandlers = Partial<Record<string, (draggedId: string) => void>>;

export function draggable(
  type: string,
  id: string,
  effect: DataTransfer['effectAllowed'] = 'move',
) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(type, id);
      event.dataTransfer.effectAllowed = effect;
    },
  };
}

export function useDropTarget(handlers: DropHandlers) {
  const [over, setOver] = useState(false);
  const acceptedType = (event: DragEvent) =>
    event.dataTransfer.types.find((type) => handlers[type]);
  return {
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        if (!acceptedType(event)) return;
        event.preventDefault();
        setOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setOver(false);
      },
      onDrop: (event: DragEvent) => {
        setOver(false);
        const type = acceptedType(event);
        if (!type) return;
        event.preventDefault();
        handlers[type]?.(event.dataTransfer.getData(type));
      },
    },
  };
}
