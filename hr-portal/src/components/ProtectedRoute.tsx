import React from 'react';
import { Navigate } from 'react-router';
import { Box, CircularProgress, Container, Paper, Typography } from '@mui/material';
import { useAuth } from './AuthProvider';
import Footer from './Footer';
import { Header } from './Header';
import { modernPortalPalette, modernPortalStatusScreenStyles } from '../theme';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, tokenExchangeCompleted, user } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: modernPortalPalette.background }}>
        <Header isLoggedIn={Boolean(user || isAuthenticated)} user={user} />
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
                Checking active session
              </Typography>
              <Typography variant="body2" sx={{ mt: 1.5, color: modernPortalPalette.body }}>
                Please wait while we confirm your active HR session.
              </Typography>
            </Paper>
          </Container>
        </Box>
        <Footer />
      </Box>
    );
  }

  if (!isAuthenticated || !tokenExchangeCompleted) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header isLoggedIn={isAuthenticated} user={user} />
      <Box sx={{ flex: 1 }}>{children}</Box>
      <Footer />
    </Box>
  );
};

export default ProtectedRoute;