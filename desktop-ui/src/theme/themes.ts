export interface ThemeDefinition {
  id: 'zinc' | 'oled' | 'slate' | 'tokyo' | 'monokai';
  name: string;
  desc: string;
  bg: string;
  surface: string;
  surfaceElevated: string;
  navBg: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  accent: string;
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent?: string;
    selectionBackground: string;
    selectionForeground?: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const THEMES_CONFIG: Record<string, ThemeDefinition> = {
  zinc: {
    id: 'zinc',
    name: 'Zinc Dark',
    desc: 'Default Linear & Cursor Charcoal',
    bg: '#09090b',
    surface: '#111113',
    surfaceElevated: '#18181b',
    navBg: '#09090b',
    border: '#27272a',
    borderSubtle: '#18181b',
    text: '#f4f4f5',
    textMuted: '#a1a1aa',
    accent: '#e4e4e7',
    terminal: {
      background: '#09090b',
      foreground: '#f4f4f5',
      cursor: '#a1a1aa',
      selectionBackground: 'rgba(255, 255, 255, 0.15)',
      black: '#18181b',
      red: '#f43f5e',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#38bdf8',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#f4f4f5',
      brightBlack: '#71717a',
      brightRed: '#fb7185',
      brightGreen: '#34d399',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#e879f9',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff',
    },
  },
  oled: {
    id: 'oled',
    name: 'OLED Black',
    desc: 'Pure Pitch Black (Zero Ambient Glow)',
    bg: '#000000',
    surface: '#050505',
    surfaceElevated: '#0a0a0a',
    navBg: '#000000',
    border: '#1c1c1f',
    borderSubtle: '#121214',
    text: '#ffffff',
    textMuted: '#888888',
    accent: '#ffffff',
    terminal: {
      background: '#000000',
      foreground: '#ffffff',
      cursor: '#ffffff',
      selectionBackground: 'rgba(255, 255, 255, 0.25)',
      black: '#000000',
      red: '#ff453a',
      green: '#30d158',
      yellow: '#ffd60a',
      blue: '#0a84ff',
      magenta: '#bf5af2',
      cyan: '#64d2ff',
      white: '#ffffff',
      brightBlack: '#636366',
      brightRed: '#ff6961',
      brightGreen: '#4cd964',
      brightYellow: '#ffe066',
      brightBlue: '#409cff',
      brightMagenta: '#d084f8',
      brightCyan: '#8ce0ff',
      brightWhite: '#ffffff',
    },
  },
  slate: {
    id: 'slate',
    name: 'Slate Navy',
    desc: 'Deep Blue-Gray Slate & VSCode Dark Pro',
    bg: '#0b0f19',
    surface: '#0f172a',
    surfaceElevated: '#1e293b',
    navBg: '#080d17',
    border: '#1e293b',
    borderSubtle: '#131d31',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    accent: '#38bdf8',
    terminal: {
      background: '#0b0f19',
      foreground: '#f8fafc',
      cursor: '#38bdf8',
      selectionBackground: 'rgba(56, 189, 248, 0.2)',
      black: '#0f172a',
      red: '#f43f5e',
      green: '#10b981',
      yellow: '#fbbf24',
      blue: '#38bdf8',
      magenta: '#c084fc',
      cyan: '#2dd4bf',
      white: '#f8fafc',
      brightBlack: '#64748b',
      brightRed: '#fb7185',
      brightGreen: '#34d399',
      brightYellow: '#fcd34d',
      brightBlue: '#7dd3fc',
      brightMagenta: '#e879f9',
      brightCyan: '#5eead4',
      brightWhite: '#ffffff',
    },
  },
  tokyo: {
    id: 'tokyo',
    name: 'Tokyo Night',
    desc: 'Modern Japanese Indigo & Purple Glow',
    bg: '#1a1b26',
    surface: '#16161e',
    surfaceElevated: '#24283b',
    navBg: '#13141c',
    border: '#2f354a',
    borderSubtle: '#1f2335',
    text: '#c0caf5',
    textMuted: '#7aa2f7',
    accent: '#bb9af7',
    terminal: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      selectionBackground: 'rgba(122, 162, 247, 0.25)',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5',
    },
  },
  monokai: {
    id: 'monokai',
    name: 'Monokai Pro',
    desc: 'Warm Classic Dark & Vintage Highlights',
    bg: '#19181a',
    surface: '#221f22',
    surfaceElevated: '#2d2a2e',
    navBg: '#151416',
    border: '#363337',
    borderSubtle: '#262327',
    text: '#fcfcfa',
    textMuted: '#939293',
    accent: '#ffd866',
    terminal: {
      background: '#19181a',
      foreground: '#fcfcfa',
      cursor: '#ffd866',
      selectionBackground: 'rgba(255, 216, 102, 0.2)',
      black: '#221f22',
      red: '#ff6188',
      green: '#a9dc76',
      yellow: '#ffd866',
      blue: '#fc9867',
      magenta: '#ab9df2',
      cyan: '#78dce8',
      white: '#fcfcfa',
      brightBlack: '#727072',
      brightRed: '#ff6188',
      brightGreen: '#a9dc76',
      brightYellow: '#ffd866',
      brightBlue: '#fc9867',
      brightMagenta: '#ab9df2',
      brightCyan: '#78dce8',
      brightWhite: '#ffffff',
    },
  },
};
