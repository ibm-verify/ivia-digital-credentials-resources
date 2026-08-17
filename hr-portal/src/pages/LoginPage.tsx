import React, { useState } from 'react';
import { useLocation, Navigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Typography,
} from '@mui/material';
import { useAuth } from '../components/AuthProvider';

const LoginPage: React.FC = () => {
  const location = useLocation();
  const [error, setError] = useState('');
  const { isAuthenticated, isLoading, tokenExchangeCompleted, login } = useAuth();

  const queryError = new URLSearchParams(location.search).get('error');

  if (isAuthenticated && tokenExchangeCompleted) {
    return <Navigate to="/portal" replace />;
  }

  const handleLogin = async () => {
    setError('');
    try {
      await login();
    } catch {
      setError('Unable to start the login flow. Check the HR portal proxy configuration and try again.');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#f9fafb',
      }}
    >
      <Container maxWidth="xs">
        <Paper
          elevation={0}
          sx={{
            p: 5,
            border: '1px solid #e5e7eb',
            borderRadius: 2,
            textAlign: 'center',
            bgcolor: 'common.white',
          }}
        >
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5, fontWeight: 600 }}>
              HR Portal
            </Typography>
            <Typography variant="h5" sx={{ mt: 1, fontWeight: 500, color: '#111827' }}>
              Employee Sign In
            </Typography>
            <Typography variant="body2" sx={{ mt: 1.5, color: '#6b7280' }}>
              Securely access and manage your employment profile and credentials.
            </Typography>
          </Box>

          {(queryError || error) && (
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              {queryError === 'callback'
                ? 'The authentication callback could not be completed. Try signing in again.'
                : error}
            </Alert>
          )}

          <Button
            fullWidth
            size="large"
            variant="contained"
            color="primary"
            onClick={handleLogin}
            disabled={isLoading}
            disableElevation
            sx={{ py: 1.5 }}
          >
            {isLoading ? 'Starting sign-in...' : 'Sign In securely'}
          </Button>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;