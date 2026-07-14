import { useCallback, useState } from 'react';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Widths for the investigation workspace's left (narratives) and right (detail)
 * rails, with drag handlers that clamp to sensible bounds. `onDragLeft` widens
 * on +dx, `onDragRight` widens on -dx (it's on the far side).
 */
export function usePanelLayout() {
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);

  const onDragLeft = useCallback((dx: number) => setLeftWidth((w) => clamp(w + dx, 200, 500)), []);
  const onDragRight = useCallback((dx: number) => setRightWidth((w) => clamp(w - dx, 280, 600)), []);

  return { leftWidth, rightWidth, onDragLeft, onDragRight };
}
