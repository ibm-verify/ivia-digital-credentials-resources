import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from './AuthProvider';
import { CircularProgress, Box, Typography } from '@mui/material';

export const RedirectToLogin: React.FC = () => {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading, tokenExchangeCompleted } = useAuth();

    useEffect(() => {
        if (!isLoading) {
            // Only consider authenticated if both isAuthenticated is true AND token exchange is completed
            if (isAuthenticated && tokenExchangeCompleted) {
                navigate('/profile', { replace: true });
            } else {
                navigate('/login', { replace: true });
            }
        }
    }, [isLoading, isAuthenticated, tokenExchangeCompleted, navigate]);

    // Show loading indicator while checking authentication status
    if (isLoading) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
            }}>
                <CircularProgress size={60} />
                <Typography variant="h6" sx={{ mt: 2 }}>
                    Checking authentication...
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Please wait while we verify your session.
                </Typography>
            </Box>
        );
    }

    return null;
};

// Made with Bob
