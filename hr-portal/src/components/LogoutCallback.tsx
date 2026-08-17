import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Box, CircularProgress, Container, Paper, Typography } from '@mui/material';
import { Header } from './Header';
import Footer from './Footer';
import { modernPortalPalette, modernPortalStatusScreenStyles } from '../theme';

const clearAuthStorage = () => {
  sessionStorage.removeItem('auth_state');
  sessionStorage.removeItem('auth_nonce');
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('oidc.'))
    .forEach(key => sessionStorage.removeItem(key));
};

const LogoutCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    clearAuthStorage();
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: modernPortalPalette.background }}>
      <Header isLoggedIn={false} />
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
        <Container maxWidth="xs">
          <Paper elevation={0} sx={modernPortalStatusScreenStyles.card}>
            <Box sx={modernPortalStatusScreenStyles.spinnerFrame}>
              <CircularProgress size={28} sx={{ color: modernPortalPalette.title }} />
            </Box>
            <Typography variant="overline" sx={{ letterSpacing: 1.5, fontWeight: 600, color: modernPortalPalette.body }}>
              HR Portal
            </Typography>
            <Typography variant="h5" sx={{ mt: 1, fontWeight: 500, color: modernPortalPalette.title }}>
              Signing out
            </Typography>
            <Typography variant="body2" sx={{ mt: 1.5, color: modernPortalPalette.body }}>
              Please wait while we close your secure HR portal session.
            </Typography>
          </Paper>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
};

export default LogoutCallback;