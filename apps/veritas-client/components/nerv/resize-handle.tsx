'use client';

import { useCallback, useRef } from 'react';

/**
 * A thin draggable vertical divider for resizing side panels. Reports the
 * horizontal delta on each move; the parent decides how to apply it (a left
 * column widens on +dx, a right column widens on -dx).
 */
export function ResizeHandle({
  onDrag,
  ariaLabel = 'Resize panel',
}: {
  onDrag: (dx: number) => void;
  ariaLabel?: string;
}) {
  const lastXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      lastXRef.current = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - lastXRef.current;
        lastXRef.current = ev.clientX;
        onDrag(dx);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onDrag],
  );

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseDown={handleMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize bg-nerv-border hover:bg-nerv-orange/40 active:bg-nerv-orange/60 transition-colors relative group"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-nerv-text-muted/20 group-hover:bg-nerv-orange/60" />
    </button>
  );
}
