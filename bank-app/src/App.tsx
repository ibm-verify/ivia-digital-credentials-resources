import React, { useEffect } from 'react'; 
import { Routes, Route, useNavigate } from 'react-router';
import { AuthProvider, useAuth } from './components/AuthProvider';
import OidcCallback from './components/OidcCallback';
import LogoutCallback from './components/LogoutCallback';
import ProtectedRoute from './components/ProtectedRoute';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  CssBaseline,
  ThemeProvider,
  createTheme
} from '@mui/material';

// Pages
import HomePage from './pages/HomePage';
import SignupPage from './pages/SignupPage';
import SuccessPage from './pages/SuccessPage';
import ProfilePage from './pages/ProfilePage';

// Components
import Footer from './components/Footer';

// Create a custom theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#5E5CFF',
    },
    secondary: {
      main: '#3A3A9F',
    },
    background: {
      default: '#FFFFFF',
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
    },
    h2: {
      fontWeight: 700,
    },
    h3: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
        containedPrimary: {
          backgroundColor: '#5E5CFF',
          '&:hover': {
            backgroundColor: '#4A48E0',
          },
        },
      },
    },
  },
});

const AppContent: React.FC = () => {
  const navigate= useNavigate();
  const {login, logout, loginWithPasskey, isAuthenticated} = useAuth();

  const handlePasskeyLogin = async () => {
    const user = await loginWithPasskey();
    if (user) navigate('/profile');
  };

  // Initialize the API server when the app starts
  useEffect(() => {
    const initializeApi = async () => {
    };

    initializeApi();
  }, []);

  return (
    <div className="bank-app">
      <AppBar position="static" color="transparent" elevation={0}>
          <Toolbar>
            <Box
              display="flex"
              alignItems="center"
              sx={{ flexGrow: 1, cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              <Box
                component="div"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  mr: 1,
                  backgroundColor: '#5E5CFF',
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  justifyContent: 'center'
                }}
              >
                <Typography variant="subtitle1" sx={{ color: 'white', fontWeight: 'bold' }}>
                  S.
                </Typography>
              </Box>
              <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
                Smart money.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button color="inherit" onClick={(e) => e.preventDefault()}>About</Button>
              <Button color="inherit" onClick={(e) => e.preventDefault()}>Services</Button>
              <Button color="inherit" onClick={(e) => e.preventDefault()}>Blog</Button>
              <Button color="inherit" onClick={(e) => e.preventDefault()}>Resources</Button>
              <Button color="inherit" onClick={(e) => e.preventDefault()}>Contact Us</Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, ml: 4 }}>
              <Button color="inherit" href="/signup">Sign Up</Button>

              {isAuthenticated ? (
                <Button variant="contained" color="primary" onClick={logout}>
                  Logout
                </Button>
              ) : (
                <>
                  <Button variant="contained" color="primary" onClick={login}>
                    Login
                  </Button>
                  <Button variant="contained" color="primary" onClick={handlePasskeyLogin}>
                    Login with Passkey
                  </Button>
                </>
              )}
            </Box>
          </Toolbar>
        </AppBar>

        <Container className="bank-content" maxWidth="lg" sx={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/logincallback" element={<OidcCallback />} />
            <Route path="/logoutcallback" element={<LogoutCallback />} /> 
            <Route path="*" element={<HomePage />} />
          </Routes>
        </Container>

        <Footer />
    </div>
  );
}


const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;

// Made with Bob
