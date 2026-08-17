import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CircularProgress, Box, Typography } from '@mui/material';

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
    <div>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh'
      }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Signing out...
        </Typography>
      </Box>
    </div>
  );
};

export default LogoutCallback;

