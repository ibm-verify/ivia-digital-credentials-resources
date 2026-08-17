import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Container,
  Paper,
  Typography,
  Button,
  Alert,
  Box,
  Stack,
  Divider,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Login as LoginIcon,
  Fingerprint as FingerprintIcon,
} from '@mui/icons-material';
import loginBgImage from '../images/login-bg-1.jpg';
import { useAuth } from '../components/AuthProvider';
import { Header } from '../components/Header';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const { login, loginWithPasskey, isAuthenticated } = useAuth();

  // If already logged in, redirect to profile settings
  useEffect(() => {
    // Check if we have a valid authentication state
    if (isAuthenticated) {
      navigate('/profile');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login();
    } catch (err) {
      setError('Failed to initiate login. Please try again.');
      setIsLoading(false);
    }
  };

  const handlePasskeyLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPasskeyLoading(true);
    setError('');
    try {
      const user = await loginWithPasskey();
      if (user) navigate('/profile');
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setError('Passkey sign-in was cancelled.');
      } else {
        setError(err?.message || 'Passkey sign-in failed. Please try again or use IBM Verify.');
      }
      setIsPasskeyLoading(false);
    }
  };

  return (
    <div className="login-wrapper" style={{
      backgroundImage: `url(${loginBgImage})`
    }}>
      <Header isLoggedIn={false}/>
      <Container maxWidth="xl">
        <Grid className='login-grid' container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Paper
              elevation={4}
              sx={{
                p: 4
              }}
            >
              <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: "bold", mb: 4 }} >
                Sign in to your account
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {error}
                </Alert>
              )}
              
              <Box component="form" noValidate>
                <Stack spacing={2}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<LoginIcon />}
                    onClick={handleLogin}
                    disabled={isLoading || isPasskeyLoading}
                    sx={{ py: 1.5, borderRadius: 2 }}
                  >
                    {isLoading ? 'Signing in...' : 'Sign in with IBM Verify'}
                  </Button>
                  <Divider>
                    <Typography variant="caption" color="text.secondary">or</Typography>
                  </Divider>
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<FingerprintIcon />}
                    onClick={handlePasskeyLogin}
                    disabled={isLoading || isPasskeyLoading}
                    sx={{ py: 1.5, borderRadius: 2 }}
                  >
                    {isPasskeyLoading ? 'Waiting for passkey...' : 'Sign in with a passkey'}
                  </Button>
                </Stack>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </div>
  );
};

export default LoginPage;

// Made with Bob
