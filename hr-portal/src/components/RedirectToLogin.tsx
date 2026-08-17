import React from 'react';
import { Navigate } from 'react-router';
import { Box, CircularProgress, Container, Paper, Typography } from '@mui/material';
import { useAuth } from './AuthProvider';
import { modernPortalPalette, modernPortalStatusScreenStyles } from '../theme';

const RedirectToLogin: React.FC = () => {
  const { isAuthenticated, isLoading, tokenExchangeCompleted } = useAuth();

  if (isLoading) {
    return (
      <Box sx={modernPortalStatusScreenStyles.shell}>
        <Container maxWidth="xs">
          <Paper elevation={0} sx={modernPortalStatusScreenStyles.card}>
            <Box sx={modernPortalStatusScreenStyles.spinnerFrame}>
              <CircularProgress size={28} sx={{ color: modernPortalPalette.title }} />
            </Box>
            <Typography variant="overline" sx={{ letterSpacing: 1.5, fontWeight: 600, color: modernPortalPalette.body }}>
              HR Portal
            </Typography>
            <Typography variant="h5" sx={{ mt: 1, fontWeight: 500, color: modernPortalPalette.title }}>
              Loading HR Portal
            </Typography>
            <Typography variant="body2" sx={{ mt: 1.5, color: modernPortalPalette.body }}>
              Please wait while we prepare your secure sign-in experience.
            </Typography>
          </Paper>
        </Container>
      </Box>
    );
  }

  if (isAuthenticated && tokenExchangeCompleted) {
    return <Navigate to="/portal" replace />;
  }

  return <Navigate to="/login" replace />;
};

export default RedirectToLogin;