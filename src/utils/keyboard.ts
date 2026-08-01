/**
 * Keyboard utility functions for shortcut handling
 */

/**
 * Extract shortcut string from keyboard event
 * Returns the shortcut identifier or empty string if not a valid shortcut key
 */
export function extractShortcutFromEvent(e: KeyboardEvent): string {
  // Handle function keys (F1-F12)
  if (e.key.startsWith('F') && !isNaN(Number(e.key.slice(1)))) {
    return e.key;
  }

  // Handle modifier keys (use code for left/right distinction)
  if (e.code === 'AltRight') return 'AltRight';
  if (e.code === 'AltLeft') return 'AltLeft';
  if (e.code === 'ControlRight') return 'ControlRight';
  if (e.code === 'ControlLeft') return 'ControlLeft';
  if (e.code === 'ShiftRight') return 'ShiftRight';
  if (e.code === 'ShiftLeft') return 'ShiftLeft';
  if (e.code === 'MetaRight') return 'MetaRight';
  if (e.code === 'MetaLeft') return 'MetaLeft';

  // Handle single digits (0-9)
  if (/^[0-9]$/.test(e.key)) {
    return e.key;
  }

  // Handle letters (a-z, A-Z)
  if (/^[a-zA-Z]$/.test(e.key)) {
    return e.key.toUpperCase();
  }

  // Handle special keys
  if (['Escape', 'Space', 'Enter', 'Tab', 'Backspace', 'Delete'].includes(e.key)) {
    return e.key;
  }

  // Handle punctuation and symbols
  if (['[', ']', '{', '}', '(', ')', '/', '?', ',', '.', '<', '>', '-', '_', '=', '+', ';', ':', "'", '"', '`', '~', '\\', '|', '!', '@', '#', '$', '%', '^', '&', '*'].includes(e.key)) {
    return e.key;
  }

  // Handle arrow keys
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    return e.key;
  }

  // Handle navigation keys
  if (['Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
    return e.key;
  }

  return '';
}

/**
 * Format shortcut for display
 * Converts internal shortcut names to user-friendly display text
 */
export function formatShortcut(shortcut: string): string {
  if (shortcut === 'AltRight' || shortcut === 'RightAlt') return '右 Alt';
  if (shortcut === 'AltLeft' || shortcut === 'LeftAlt') return '左 Alt';
  if (shortcut === 'ControlRight') return '右 Ctrl';
  if (shortcut === 'ControlLeft') return '左 Ctrl';
  if (shortcut === 'ShiftRight') return '右 Shift';
  if (shortcut === 'ShiftLeft') return '左 Shift';
  if (shortcut === 'MetaRight') return '右 Win';
  if (shortcut === 'MetaLeft') return '左 Win';
  if (shortcut.startsWith('F') && !isNaN(Number(shortcut.slice(1)))) return shortcut;
  return shortcut.toUpperCase();
}
