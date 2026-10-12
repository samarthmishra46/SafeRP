import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { alpha, createTheme, type PaletteMode } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    mono: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    mono?: React.CSSProperties;
  }
  interface Palette {
    surface: { panel: string; raised: string; sunken: string };
  }
  interface PaletteOptions {
    surface?: { panel: string; raised: string; sunken: string };
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    mono: true;
  }
}

export const SANS = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

const tokens = {
  light: {
    primary: '#2F4B8A',
    bg: '#EEF1F4',
    panel: '#FFFFFF',
    raised: '#FFFFFF',
    sunken: '#F4F6F8',
    text: '#17202B',
    textSecondary: '#5A6676',
    divider: '#E1E6EC',
  },
  dark: {
    primary: '#9DB4F0',
    bg: '#0E1217',
    panel: '#161B22',
    raised: '#1D232C',
    sunken: '#12161C',
    text: '#E6EAF0',
    textSecondary: '#9AA5B4',
    divider: '#2A313B',
  },
} as const;

export function createAppTheme(mode: PaletteMode) {
  const t = tokens[mode];
  const shadowColor = mode === 'light' ? '23, 32, 43' : '0, 0, 0';
  const soft = (y: number, blur: number, a: number) =>
    `0 ${y}px ${blur}px rgba(${shadowColor}, ${a})`;

  const theme = createTheme({
    palette: {
      mode,
      primary: { main: t.primary, contrastText: mode === 'light' ? '#FFFFFF' : '#0E1217' },
      background: { default: t.bg, paper: t.panel },
      text: { primary: t.text, secondary: t.textSecondary },
      divider: t.divider,
      surface: { panel: t.panel, raised: t.raised, sunken: t.sunken },
      error: { main: mode === 'light' ? '#B3261E' : '#F2B8B5' },
      warning: { main: mode === 'light' ? '#9A5B00' : '#F7C46C' },
      info: { main: t.primary },
      success: { main: mode === 'light' ? '#0E7A5A' : '#5ED3A8' },
    },
    shape: { borderRadius: 10 },
    spacing: 8,
    typography: {
      fontFamily: SANS,
      fontSize: 14,
      h1: { fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.01em' },
      h2: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.005em' },
      h3: { fontSize: '1rem', fontWeight: 600 },
      subtitle1: { fontWeight: 600, fontSize: '0.9375rem' },
      subtitle2: { fontWeight: 600, fontSize: '0.8125rem' },
      body2: { fontSize: '0.8125rem' },
      caption: { fontSize: '0.75rem', color: t.textSecondary },
      overline: {
        fontFamily: MONO,
        fontSize: '0.6875rem',
        fontWeight: 500,
        letterSpacing: '0.06em',
        lineHeight: 1.6,
        textTransform: 'none',
      },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
      mono: { fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem' },
    },
    shadows: [
      'none',
      `${soft(1, 2, 0.06)}, ${soft(1, 3, 0.04)}`,
      `${soft(2, 6, 0.08)}, ${soft(1, 2, 0.04)}`,
      `${soft(6, 16, 0.1)}, ${soft(2, 4, 0.05)}`,
      `${soft(10, 28, 0.14)}, ${soft(2, 6, 0.06)}`,
      ...Array(20).fill(`${soft(16, 40, 0.18)}, ${soft(4, 10, 0.08)}`),
    ] as never,
  });

  return createTheme(theme, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          'html, body, #root': { height: '100%' },
          body: { overflow: 'hidden', WebkitFontSmoothing: 'antialiased' },
          ':focus-visible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
          '.maplibregl-popup-content': {
            background: t.raised,
            color: t.text,
            borderRadius: 10,
            padding: 0,
            boxShadow: theme.shadows[4],
            fontFamily: SANS,
          },
          '.maplibregl-popup-tip': { display: 'none' },
          '.maplibregl-ctrl-group': {
            background: `${t.raised} !important`,
            borderRadius: '10px !important',
            boxShadow: `${theme.shadows[2]} !important`,
          },
          '.maplibregl-ctrl-group button + button': { borderTopColor: `${t.divider} !important` },
          '.maplibregl-ctrl-icon': { filter: mode === 'dark' ? 'invert(1)' : 'none' },
          '.saferp-anim-ctrl button': {
            color: t.text,
            display: 'grid',
            placeItems: 'center',
          },
          '.maplibregl-ctrl-attrib': {
            background: `${alpha(t.panel, 0.8)} !important`,
            color: t.textSecondary,
            fontSize: 10,
          },
          '.maplibregl-ctrl-attrib a': { color: `${t.textSecondary} !important` },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, paddingInline: 16 },
          sizeLarge: { paddingBlock: 10, fontSize: '0.9375rem' },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: t.sunken,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: t.divider },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(theme.palette.text.primary, 0.3),
            },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            borderColor: t.divider,
            paddingBlock: 6,
            '&.Mui-selected': {
              backgroundColor: alpha(theme.palette.primary.main, mode === 'light' ? 0.1 : 0.18),
              color: theme.palette.primary.main,
            },
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 6, fontWeight: 500 } } },
      MuiTooltip: {
        defaultProps: { arrow: false, enterDelay: 300 },
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'light' ? '#17202B' : '#E6EAF0',
            color: mode === 'light' ? '#FFFFFF' : '#0E1217',
            fontSize: '0.75rem',
            borderRadius: 6,
          },
        },
      },
      MuiSlider: {
        styleOverrides: {
          thumb: { width: 16, height: 16, boxShadow: theme.shadows[2] },
          rail: { opacity: 1, backgroundColor: t.divider },
          mark: { backgroundColor: alpha(theme.palette.text.primary, 0.25), width: 1, height: 8 },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: t.divider, paddingBlock: 6, paddingInline: 8 },
          head: { fontWeight: 600, color: t.textSecondary, fontSize: '0.75rem' },
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: 10, alignItems: 'flex-start' } } },
      MuiSkeleton: { defaultProps: { animation: 'wave' } },
    },
  });
}
