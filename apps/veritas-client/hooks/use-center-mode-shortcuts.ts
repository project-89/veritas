import { useEffect } from 'react';
import type { CenterMode } from '../lib/investigation-context';

/**
 * Binds single-key shortcuts (from the given map) to the center-mode switcher,
 * ignoring keystrokes while the user is typing in an input or textarea.
 */
export function useCenterModeShortcuts(
  shortcutMap: Map<string, CenterMode>,
  setCenterMode: (mode: CenterMode) => void,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const mode = shortcutMap.get(e.key.toUpperCase());
      if (mode) setCenterMode(mode);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcutMap, setCenterMode]);
}
