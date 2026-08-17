import { createTheme } from '@mui/material/styles';

export const modernPortalPalette = {
  background: '#f9fafb',
  surface: '#ffffff',
  border: '#e5e7eb',
  borderMuted: '#f3f4f6',
  title: '#111827',
  body: '#6b7280',
} as const;

export const modernPortalStatusScreenStyles = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    px: 2,
    bgcolor: modernPortalPalette.background,
  },
  card: {
    width: '100%',
    p: 5,
    border: `1px solid ${modernPortalPalette.border}`,
    borderRadius: 2,
    textAlign: 'center',
    bgcolor: modernPortalPalette.surface,
  },
  spinnerFrame: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    mb: 3,
    border: `1px solid ${modernPortalPalette.border}`,
    borderRadius: '50%',
    bgcolor: modernPortalPalette.borderMuted,
  },
} as const;

const colors = {
  evergreen: '#123B38',
  deepForest: '#0A2421',
  hrAmber: '#9F6939',
  copper: '#B56A2D',
  moss: '#2C5A50',
  parchment: '#F6F0E7',
  mist: '#DCE9E4',
  white: '#FFFFFF',
  ink: '#14211F',
  slate: '#546965',
  success: '#2E7D4E',
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: colors.hrAmber,
      dark: '#7A4F28',
      light: '#C48B5A',
      contrastText: colors.white,
    },
    secondary: {
      main: colors.copper,
      dark: '#8A4C18',
      light: '#DFA06C',
      contrastText: colors.white,
    },
    background: {
      default: colors.parchment,
      paper: colors.white,
    },
    text: {
      primary: colors.ink,
      secondary: colors.slate,
    },
    success: {
      main: colors.success,
    },
  },
  shape: {
    borderRadius: 18,
  },
  typography: {
    fontFamily: 'Aptos, Segoe UI, Helvetica Neue, Arial, sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.04em',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.04em',
    },
    h3: {
      fontWeight: 700,
      letterSpacing: '-0.03em',
    },
    h4: {
      fontWeight: 650,
    },
    h5: {
      fontWeight: 650,
    },
    button: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
      textTransform: 'none',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 18,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export default theme;