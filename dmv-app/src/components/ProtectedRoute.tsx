import React from 'react';
import { Navigate } from 'react-router';
import { Header } from './Header';
import { useAuth } from './AuthProvider';
import { CircularProgress, Box } from '@mui/material';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, user, tokenExchangeCompleted } = useAuth();
  
  if (isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <CircularProgress />
      </Box>
    );
  }
  
  // Only allow access if both authenticated AND token exchange is completed
  if (!isAuthenticated || !tokenExchangeCompleted) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Header isLoggedIn={isAuthenticated} user={user} />
      {children}
    </>
  );
};

export default ProtectedRoute;

// Made with Bob
