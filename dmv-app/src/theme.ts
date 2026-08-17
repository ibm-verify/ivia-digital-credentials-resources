import { createTheme } from '@mui/material/styles';

// Color palette from the website image
const colors = {
    // Primary Colors
    navyBlue: '#0A1033',
    royalBlue: '#1A46E5',
    dmvRed: '#BB162D',
    white: '#FFFFFF',

    // Secondary Colors
    slateBlue: '#3D4466',
    lightGray: '#F5F5F7',
    mediumGray: '#8A8D9F',

    // Accent Colors
    lightBlue: '#E8EDFF',
    black: '#000000',
};

// Create a theme instance
const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: colors.dmvRed,
            dark: '#8C0F20',
            light: '#D94056',
            contrastText: colors.white,
        },
        secondary: {
            main: colors.slateBlue,
            light: colors.mediumGray,
            dark: colors.navyBlue,
            contrastText: colors.white,
        },
        background: {
            default: colors.lightGray,
            paper: colors.white,
        },
        text: {
            primary: colors.black,
            secondary: colors.slateBlue,
            disabled: colors.mediumGray,
        },
        error: {
            main: '#FF3B30', // Standard red for errors
        },
        warning: {
            main: '#FF9500', // Standard orange for warnings
        },
        info: {
            main: colors.lightBlue,
        },
        success: {
            main: '#34C759', // Standard green for success
        },
    },
    typography: {
        fontFamily: 'Roboto, Arial, sans-serif',
        h1: {
            fontWeight: 700,
            color: colors.navyBlue,
        },
        h2: {
            fontWeight: 600,
            color: colors.navyBlue,
        },
        h3: {
            fontWeight: 600,
            color: colors.navyBlue,
        },
        h4: {
            fontWeight: 600,
            color: colors.navyBlue,
        },
        h5: {
            fontWeight: 500,
            color: colors.navyBlue,
        },
        h6: {
            fontWeight: 500,
            color: colors.navyBlue,
        },
        subtitle1: {
            color: colors.slateBlue,
        },
        subtitle2: {
            color: colors.slateBlue,
        },
        body1: {
            color: colors.black,
        },
        body2: {
            color: colors.slateBlue,
        },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 4,
                    textTransform: 'none',
                    fontWeight: 500,
                },
                contained: {
                    boxShadow: 'none',
                    '&:hover': {
                        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.05)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: colors.dmvRed,
                },
            },
        },
    },
});

export default theme;

// Made with Bob
