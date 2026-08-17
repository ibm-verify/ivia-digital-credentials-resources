import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { CircularProgress, Box, Typography } from '@mui/material';
import { useAuth } from './AuthProvider';

const OidcCallback: React.FC = () => {
  const navigate = useNavigate();
  const calledRef = useRef(false);
  const { loginCallback } = useAuth();

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    (async () => {
      const user = await loginCallback();
      if (user) navigate("/profile");
      else navigate("/");
    })();
  }, [loginCallback, navigate]);

  // Always show loading spinner during processing
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
          Processing authentication...
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Please wait while we complete your login.
        </Typography>
      </Box>
    </div>
  );
};

export default OidcCallback;
