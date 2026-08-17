import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Box, CircularProgress, Container, Paper, Typography } from '@mui/material';
import { useAuth } from './AuthProvider';
import Footer from './Footer';
import { Header } from './Header';
import { modernPortalPalette, modernPortalStatusScreenStyles } from '../theme';

const OidcCallback: React.FC = () => {
  const navigate = useNavigate();
  const calledRef = useRef(false);
  const { loginCallback } = useAuth();

  useEffect(() => {
    if (calledRef.current) {
      return;
    }

    calledRef.current = true;

    (async () => {
      const user = await loginCallback();
      if (user) {
        navigate('/portal', { replace: true });
        return;
      }

      navigate('/login?error=callback', { replace: true });
    })();
  }, [loginCallback, navigate]);

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
              Completing sign-in
            </Typography>
            <Typography variant="body2" sx={{ mt: 1.5, color: modernPortalPalette.body }}>
              Please wait while HR Portal finalizes your session.
            </Typography>
          </Paper>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
};

export default OidcCallback;