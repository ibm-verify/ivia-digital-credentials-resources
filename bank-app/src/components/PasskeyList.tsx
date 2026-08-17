import React, { useEffect, useState, useCallback } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { Fingerprint as FingerprintIcon } from '@mui/icons-material';

interface PasskeyRegistration {
  id: string;
  created?: string;
  attempted?: string;
  enabled?: boolean;
  attributes?: {
    nickname?: string;
  };
}

interface PasskeyListProps {
  refreshTrigger?: number;
}

const PasskeyList: React.FC<PasskeyListProps> = ({ refreshTrigger }) => {
  const [passkeys, setPasskeys] = useState<PasskeyRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PasskeyRegistration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchPasskeys = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/auth/passkey/list');
      if (!response.ok) {
        throw new Error(`Failed to fetch passkeys: ${response.status}`);
      }
      const data = await response.json();
      const list: PasskeyRegistration[] = Array.isArray(data)
        ? data
        : data.fido2 ?? data.fido2Registrations ?? data.registrations ?? [];
      setPasskeys(list);
    } catch (err: any) {
      setError(err?.message || 'Failed to load passkeys.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys, refreshTrigger]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/auth/passkey/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.details || body?.error || `Failed to delete passkey: ${response.status}`);
      }
      setDeleteTarget(null);
      await fetchPasskeys();
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete passkey. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2, px: 3 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">Loading passkeys…</Typography>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ mx: 3, mb: 2 }}>{error}</Alert>;
  }

  if (passkeys.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 3, pb: 2 }}>
        No passkeys registered yet.
      </Typography>
    );
  }

  return (
    <>
      <List disablePadding>
        {passkeys.map((pk, idx) => (
          <React.Fragment key={pk.id}>
            <ListItem sx={{ py: 1 }}>
              <FingerprintIcon sx={{ mr: 1.5, color: 'text.secondary', flexShrink: 0 }} />
              <ListItemText
                primary={pk.attributes?.nickname || 'Passkey'}
                secondary={
                  [
                    pk.created && `Added ${formatDate(pk.created)}`,
                    pk.attempted && `Last used ${formatDate(pk.attempted)}`
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                primaryTypographyProps={{ fontWeight: 'medium' }}
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  aria-label={`Delete passkey ${pk.attributes?.nickname || pk.id}`}
                  onClick={() => { setDeleteTarget(pk); setDeleteError(''); }}
                  color="error"
                  size="small"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
            {idx < passkeys.length - 1 && <Divider component="li" />}
          </React.Fragment>
        ))}
      </List>

      <Dialog open={!!deleteTarget} onClose={() => !isDeleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove passkey?</DialogTitle>
        <DialogContent>
          {deleteError && <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>}
          <DialogContentText>
            Remove <strong>{deleteTarget?.attributes?.nickname || 'this passkey'}</strong>? You will no longer be able to
            use it to sign in.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {isDeleting ? 'Removing…' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PasskeyList;
