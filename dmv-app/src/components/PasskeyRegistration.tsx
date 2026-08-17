import React, { useState } from 'react';
import {
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Typography,
  Box
} from '@mui/material';
import { Fingerprint as FingerprintIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { useAuth } from './AuthProvider';

interface PasskeyRegistrationProps {
  onSuccess?: () => void;
}

const PasskeyRegistration: React.FC<PasskeyRegistrationProps> = ({ onSuccess }) => {
  const { registerPasskey } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleOpen = () => {
    setDialogOpen(true);
    setError('');
    setSuccess(false);
    setNickname('');
  };

  const handleClose = () => {
    if (isRegistering) return;
    setDialogOpen(false);
  };

  const handleRegister = async () => {
    setIsRegistering(true);
    setError('');
    try {
      await registerPasskey(nickname || 'My Passkey');
      setSuccess(true);
      onSuccess?.();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setError('Registration was cancelled or timed out. Please try again.');
      } else if (err?.name === 'InvalidStateError') {
        setError('A passkey is already registered on this device for your account.');
      } else {
        setError(err?.message || 'Failed to register passkey. Please try again.');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <>
      <Button
        variant="contained"
        endIcon={<FingerprintIcon />}
        onClick={handleOpen}
        sx={{ borderRadius: 2 }}
      >
        Register a passkey
      </Button>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>Register a passkey</DialogTitle>
        <DialogContent>
          {success ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, gap: 2 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 48 }} />
              <Typography variant="body1" textAlign="center">
                Passkey registered successfully. You can now sign in without a password.
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Passkeys use your device's biometrics to sign in securely without a password. Your passkey is stored on this device and registered with IBM Verify.
              </Typography>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <TextField
                label="Passkey nickname (optional)"
                placeholder="e.g. 1Password"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                fullWidth
                size="small"
                disabled={isRegistering}
                inputProps={{ maxLength: 64 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          {success ? (
            <Button onClick={handleClose} variant="contained">Done</Button>
          ) : (
            <>
              <Button onClick={handleClose} disabled={isRegistering}>Cancel</Button>
              <Button
                onClick={handleRegister}
                variant="contained"
                disabled={isRegistering}
                startIcon={isRegistering ? <CircularProgress size={16} /> : <FingerprintIcon />}
              >
                {isRegistering ? 'Registering...' : 'Register'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PasskeyRegistration;
