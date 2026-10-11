import { CssBaseline, ThemeProvider, useMediaQuery, type PaletteMode } from '@mui/material';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createAppTheme } from './theme';

const STORAGE_KEY = 'saferp:theme';

interface ThemeModeValue {
  mode: PaletteMode;
  toggle: () => void;
}

const ThemeModeContext = createContext<ThemeModeValue>({ mode: 'light', toggle: () => {} });

function readStored(): PaletteMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [stored, setStored] = useState<PaletteMode | null>(readStored);
  const mode: PaletteMode = stored ?? (prefersDark ? 'dark' : 'light');

  const toggle = useCallback(() => {
    const next = mode === 'light' ? 'dark' : 'light';
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this session only */
    }
  }, [mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeMode() {
  return useContext(ThemeModeContext);
}
