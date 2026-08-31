/**
 * Keyboard utility functions for shortcut handling
 */

/**
 * Windows 键码映射表
 * 与 Rust keyhook 插件返回的 raw_code 对应
 */
const WINDOWS_KEY_MAP: Record<number, string> = {
  // 修饰键（左右区分）- 使用虚拟键码
  0xA0: 'LeftShift',      // 160
  0xA1: 'RightShift',     // 161
  0xA2: 'LeftCtrl',       // 162
  0xA3: 'RightCtrl',      // 163
  0xA4: 'LeftAlt',        // 164
  0xA5: 'RightAlt',       // 165
  0x5B: 'LeftWindows',    // 91
  0x5C: 'RightWindows',   // 92

  // 数字键 0-9 (主键盘上方)
  0x30: 'Digit0',         // 48
  0x31: 'Digit1',         // 49
  0x32: 'Digit2',         // 50
  0x33: 'Digit3',         // 51
  0x34: 'Digit4',         // 52
  0x35: 'Digit5',         // 53
  0x36: 'Digit6',         // 54
  0x37: 'Digit7',         // 55
  0x38: 'Digit8',         // 56
  0x39: 'Digit9',         // 57

  // 字母键 A-Z
  0x41: 'KeyA',           // 65
  0x42: 'KeyB',           // 66
  0x43: 'KeyC',           // 67
  0x44: 'KeyD',           // 68
  0x45: 'KeyE',           // 69
  0x46: 'KeyF',           // 70
  0x47: 'KeyG',           // 71
  0x48: 'KeyH',           // 72
  0x49: 'KeyI',           // 73
  0x4A: 'KeyJ',           // 74
  0x4B: 'KeyK',           // 75
  0x4C: 'KeyL',           // 76
  0x4D: 'KeyM',           // 77
  0x4E: 'KeyN',           // 78
  0x4F: 'KeyO',           // 79
  0x50: 'KeyP',           // 80
  0x51: 'KeyQ',           // 81
  0x52: 'KeyR',           // 82
  0x53: 'KeyS',           // 83
  0x54: 'KeyT',           // 84
  0x55: 'KeyU',           // 85
  0x56: 'KeyV',           // 86
  0x57: 'KeyW',           // 87
  0x58: 'KeyX',           // 88
  0x59: 'KeyY',           // 89
  0x5A: 'KeyZ',           // 90

  // 标点符号键
  0xBA: 'Semicolon',      // 186 ; :
  0xBB: 'Equal',          // 187 = +
  0xBC: 'Comma',          // 188 , <
  0xBD: 'Minus',          // 189 - _
  0xBE: 'Period',         // 190 . >
  0xBF: 'Slash',          // 191 / ?
  0xC0: 'Backquote',      // 192 ` ~
  0xDB: 'BracketLeft',    // 219 [ {
  0xDC: 'Backslash',      // 220 \ |
  0xDD: 'BracketRight',   // 221 ] }
  0xDE: 'Quote',          // 222 ' "

  // 功能键 F1-F24
  0x70: 'F1',             // 112
  0x71: 'F2',             // 113
  0x72: 'F3',             // 114
  0x73: 'F4',             // 115
  0x74: 'F5',             // 116
  0x75: 'F6',             // 117
  0x76: 'F7',             // 118
  0x77: 'F8',             // 119
  0x78: 'F9',             // 120
  0x79: 'F10',            // 121
  0x7A: 'F11',            // 122
  0x7B: 'F12',            // 123
  0x7C: 'F13',            // 124
  0x7D: 'F14',            // 125
  0x7E: 'F15',            // 126
  0x7F: 'F16',            // 127
  0x80: 'F17',            // 128
  0x81: 'F18',            // 129
  0x82: 'F19',            // 130
  0x83: 'F20',            // 131
  0x84: 'F21',            // 132
  0x85: 'F22',            // 133
  0x86: 'F23',            // 134
  0x87: 'F24',            // 135

  // 特殊键
  0x08: 'Backspace',      // 8
  0x09: 'Tab',            // 9
  0x0D: 'Enter',          // 13
  0x1B: 'Escape',         // 27
  0x20: 'Space',          // 32

  // 方向键
  0x25: 'ArrowLeft',      // 37
  0x26: 'ArrowUp',        // 38
  0x27: 'ArrowRight',     // 39
  0x28: 'ArrowDown',      // 40

  // 导航键
  0x21: 'PageUp',         // 33
  0x22: 'PageDown',       // 34
  0x23: 'End',            // 35
  0x24: 'Home',           // 36
};

/**
 * macOS 键码映射表
 */
const MACOS_KEY_MAP: Record<number, string> = {
  // 修饰键（左右区分）
  56: 'LeftShift',
  60: 'RightShift',
  59: 'LeftCtrl',
  62: 'RightCtrl',
  58: 'LeftOption',
  61: 'RightOption',
  55: 'LeftCmd',
  54: 'RightCmd',
  63: 'Fn',
  // 功能键 F1-F12
  122: 'F1',
  120: 'F2',
  99: 'F3',
  118: 'F4',
  96: 'F5',
  97: 'F6',
  98: 'F7',
  100: 'F8',
  101: 'F9',
  109: 'F10',
  103: 'F11',
  111: 'F12',
  // 特殊键
  36: 'Enter',
  48: 'Tab',
  49: 'Space',
  51: 'Backspace',
  53: 'Escape',
  // 方向键
  123: 'ArrowLeft',
  124: 'ArrowRight',
  125: 'ArrowDown',
  126: 'ArrowUp',
  // 导航键
  115: 'Home',
  119: 'End',
  116: 'PageUp',
  121: 'PageDown',
};

/**
 * 将 keyhook 的 keycode 转换为快捷键标识符
 * @param keycode keyhook 返回的标准化键名（如 LeftCtrl、KeyA、Digit1）
 * @param rawCode 原始键码
 * @param isMac 是否为 macOS
 */
export function mapKeycodeToShortcut(keycode: string, rawCode: number, isMac: boolean): string | null {
  // 修饰键直接返回
  if (['LeftCtrl', 'RightCtrl', 'LeftShift', 'RightShift', 'LeftAlt', 'RightAlt',
       'LeftWindows', 'RightWindows', 'LeftOption', 'RightOption', 'LeftCmd', 'RightCmd', 'Fn'].includes(keycode)) {
    return keycode;
  }

  // 功能键 F1-F24
  if (/^F\d+$/.test(keycode)) {
    return keycode;
  }

  // 特殊键
  if (['Backspace', 'Tab', 'Enter', 'Escape', 'Space',
       'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown',
       'PageUp', 'PageDown', 'Home', 'End'].includes(keycode)) {
    return keycode;
  }

  // 字母键 KeyA -> A
  if (keycode.startsWith('Key') && keycode.length === 4) {
    return keycode.slice(3); // KeyA -> A
  }

  // 数字键 Digit0 -> 0
  if (keycode.startsWith('Digit') && keycode.length === 6) {
    return keycode.slice(5); // Digit0 -> 0
  }

  // 标点符号键 - 返回对应的符号
  const symbolMap: Record<string, string> = {
    'Semicolon': ';',
    'Equal': '=',
    'Comma': ',',
    'Minus': '-',
    'Period': '.',
    'Slash': '/',
    'Backquote': '`',
    'BracketLeft': '[',
    'Backslash': '\\',
    'BracketRight': ']',
    'Quote': "'",
  };
  if (symbolMap[keycode]) {
    return symbolMap[keycode];
  }

  // macOS 字母键（使用 rawCode）
  if (isMac && rawCode >= 0 && rawCode <= 51) {
    const letterMap: Record<number, string> = {
      0: 'A', 1: 'S', 2: 'D', 3: 'F', 4: 'H', 5: 'G', 6: 'Z', 7: 'X',
      8: 'C', 9: 'V', 11: 'B', 12: 'Q', 13: 'W', 14: 'E', 15: 'R',
      16: 'Y', 17: 'T', 31: 'O', 32: 'U', 34: 'I', 35: 'P', 37: 'L',
      38: 'J', 40: 'K', 45: 'N', 46: 'M',
    };
    if (letterMap[rawCode]) return letterMap[rawCode];
  }

  // macOS 数字键（使用 rawCode）
  if (isMac && rawCode >= 18 && rawCode <= 29) {
    const digitMap: Record<number, string> = {
      18: '1', 19: '2', 20: '3', 21: '4', 23: '5', 22: '6',
      26: '7', 28: '8', 25: '9', 29: '0',
    };
    if (digitMap[rawCode]) return digitMap[rawCode];
  }

  return null;
}

/**
 * 将原始键码映射到标准化按键名称
 * @param rawCode 原始键码
 * @param isMac 是否为 macOS
 * @deprecated 使用 mapKeycodeToShortcut 代替
 */
export function mapRawCodeToKeyName(rawCode: number, isMac: boolean): string | null {
  if (isMac) {
    // macOS: 字母键码范围
    if (rawCode >= 0 && rawCode <= 51) {
      const letterMap: Record<number, string> = {
        0: 'A', 1: 'S', 2: 'D', 3: 'F', 4: 'H', 5: 'G', 6: 'Z', 7: 'X',
        8: 'C', 9: 'V', 11: 'B', 12: 'Q', 13: 'W', 14: 'E', 15: 'R',
        16: 'Y', 17: 'T', 31: 'O', 32: 'U', 34: 'I', 35: 'P', 37: 'L',
        38: 'J', 40: 'K', 45: 'N', 46: 'M',
      };
      if (letterMap[rawCode]) return letterMap[rawCode];
    }
    // macOS: 数字键码范围
    if (rawCode >= 18 && rawCode <= 29) {
      const digitMap: Record<number, string> = {
        18: '1', 19: '2', 20: '3', 21: '4', 23: '5', 22: '6',
        26: '7', 28: '8', 25: '9', 29: '0',
      };
      if (digitMap[rawCode]) return digitMap[rawCode];
    }
    return MACOS_KEY_MAP[rawCode] || null;
  } else {
    // Windows: 使用键码映射表
    return WINDOWS_KEY_MAP[rawCode] || null;
  }
}

/**
 * 将 keyhook 的 keycode 转换为显示名称
 */
export function getKeycodeDisplayName(keycode: string, isMac: boolean): string {
  // macOS 修饰键映射
  if (isMac) {
    switch (keycode) {
      case 'LeftOption': return '左 Option';
      case 'RightOption': return '右 Option';
      case 'LeftCmd': return '左 Cmd';
      case 'RightCmd': return '右 Cmd';
      case 'LeftCtrl': return '左 Ctrl';
      case 'RightCtrl': return '右 Ctrl';
      case 'LeftShift': return '左 Shift';
      case 'RightShift': return '右 Shift';
      case 'Fn': return 'Fn';
    }
  }

  // Windows 修饰键映射
  switch (keycode) {
    case 'LeftAlt': return '左 Alt';
    case 'RightAlt': return '右 Alt';
    case 'LeftWindows': return '左 Win';
    case 'RightWindows': return '右 Win';
    case 'LeftCtrl': return '左 Ctrl';
    case 'RightCtrl': return '右 Ctrl';
    case 'LeftShift': return '左 Shift';
    case 'RightShift': return '右 Shift';
  }

  // 功能键
  if (/^F\d+$/.test(keycode)) {
    return keycode;
  }

  // 方向键
  switch (keycode) {
    case 'ArrowUp': return '↑';
    case 'ArrowDown': return '↓';
    case 'ArrowLeft': return '←';
    case 'ArrowRight': return '→';
  }

  // 字母键 KeyA -> A
  if (keycode.startsWith('Key') && keycode.length === 4) {
    return keycode.slice(3);
  }

  // 数字键 Digit0 -> 0
  if (keycode.startsWith('Digit') && keycode.length === 6) {
    return keycode.slice(5);
  }

  return keycode;
}

/**
 * Extract shortcut string from keyboard event
 * Returns the shortcut identifier or empty string if not a valid shortcut key
 */
export function extractShortcutFromEvent(e: KeyboardEvent): string {
  // Handle function keys (F1-F24)
  if (e.key.startsWith('F') && !isNaN(Number(e.key.slice(1)))) {
    return e.key;
  }

  // Handle modifier keys (use code for left/right distinction)
  if (e.code === 'AltRight') return 'RightAlt';
  if (e.code === 'AltLeft') return 'LeftAlt';
  if (e.code === 'ControlRight') return 'RightCtrl';
  if (e.code === 'ControlLeft') return 'LeftCtrl';
  if (e.code === 'ShiftRight') return 'RightShift';
  if (e.code === 'ShiftLeft') return 'LeftShift';
  if (e.code === 'MetaRight') return 'RightWindows';
  if (e.code === 'MetaLeft') return 'LeftWindows';

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
  if (shortcut === 'ControlRight' || shortcut === 'RightCtrl') return '右 Ctrl';
  if (shortcut === 'ControlLeft' || shortcut === 'LeftCtrl') return '左 Ctrl';
  if (shortcut === 'ShiftRight' || shortcut === 'RightShift') return '右 Shift';
  if (shortcut === 'ShiftLeft' || shortcut === 'LeftShift') return '左 Shift';
  if (shortcut === 'MetaRight' || shortcut === 'RightWindows') return '右 Win';
  if (shortcut === 'MetaLeft' || shortcut === 'LeftWindows') return '左 Win';
  if (/^F\d+$/.test(shortcut)) return shortcut;
  return shortcut.toUpperCase();
}

/**
 * Parse shortcut for split display (prefix + main)
 * Used for keycap styling: prefix (smaller) + main (normal)
 * @returns { prefix: string, main: string } - prefix is "左"/"右" for modifier keys, main is the key name
 */
export function parseShortcutForDisplay(shortcut: string): { prefix: string; main: string } {
  // 左修饰键
  if (shortcut === 'AltLeft' || shortcut === 'LeftAlt') return { prefix: '左', main: 'Alt' };
  if (shortcut === 'ControlLeft' || shortcut === 'LeftCtrl') return { prefix: '左', main: 'Ctrl' };
  if (shortcut === 'ShiftLeft' || shortcut === 'LeftShift') return { prefix: '左', main: 'Shift' };
  if (shortcut === 'MetaLeft' || shortcut === 'LeftWindows') return { prefix: '左', main: 'Win' };

  // 右修饰键
  if (shortcut === 'AltRight' || shortcut === 'RightAlt') return { prefix: '右', main: 'Alt' };
  if (shortcut === 'ControlRight' || shortcut === 'RightCtrl') return { prefix: '右', main: 'Ctrl' };
  if (shortcut === 'ShiftRight' || shortcut === 'RightShift') return { prefix: '右', main: 'Shift' };
  if (shortcut === 'MetaRight' || shortcut === 'RightWindows') return { prefix: '右', main: 'Win' };

  // 其他键没有前缀
  return { prefix: '', main: formatShortcut(shortcut) };
}