import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemText,
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AccountBalance,
  ArrowUpward,
  ArrowDownward,
  DeleteForever,
} from '@mui/icons-material';
import { useAuth } from '../components/AuthProvider';
import PasskeyRegistration from '../components/PasskeyRegistration';
import PasskeyList from '../components/PasskeyList';
import LoanApplicationCard from '../components/LoanApplicationCard';

const transactions = [
  { id: 1, name: 'Netflix Subscription', date: 'May 21, 2026', amount: -15.99, category: 'Entertainment' },
  { id: 2, name: 'Salary Deposit', date: 'May 20, 2026', amount: 4500.00, category: 'Income' },
  { id: 3, name: 'Grocery Store', date: 'May 19, 2026', amount: -87.42, category: 'Food' },
  { id: 4, name: 'Transfer from John', date: 'May 18, 2026', amount: 250.00, category: 'Transfer' },
  { id: 5, name: 'Electric Bill', date: 'May 17, 2026', amount: -134.00, category: 'Utilities' },
];

const ProfilePage: React.FC = () => {
  const { user } = useAuth();

  const firstName = user?.profile?.given_name ?? user?.profile?.name?.split(' ')[0] ?? 'there';
  const email = user?.profile?.email as string | undefined;

  const [passkeyRefreshTrigger, setPasskeyRefreshTrigger] = useState(0);
  const [closeAccountDialogOpen, setCloseAccountDialogOpen] = useState(false);
  const [isClosingAccount, setIsClosingAccount] = useState(false);
  const [closeAccountError, setCloseAccountError] = useState('');

  const handleCloseAccount = async () => {
    setIsClosingAccount(true);
    setCloseAccountError('');

    try {
      const response = await fetch('/api/account', { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'We could not close your account. Please try again.');
      }

      if (data.logoutUrl) {
        window.location.replace(data.logoutUrl);
        return;
      }

      window.location.replace('/');
    } catch (error: any) {
      setCloseAccountError(error.message || 'We could not close your account. Please try again.');
      setIsClosingAccount(false);
    }
  };

  return (
    <Box sx={{ py: 4 }}>
      <Container maxWidth="lg">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight="bold">
            Welcome back, {firstName}!
          </Typography>
          {email && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {email}
            </Typography>
          )}
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                background: 'linear-gradient(135deg, #5E5CFF 0%, #3A3A9F 100%)',
                color: 'white',
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>Savings Account</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.6 }}>•••• •••• •••• 4821</Typography>
                </Box>
                <AccountBalance />
              </Box>
              <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>$24,581.40</Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>Available balance</Typography>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #eee' }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Recent Transactions</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {transactions.map((tx, index) => (
                  <Box key={tx.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar
                          sx={{
                            width: 36,
                            height: 36,
                            bgcolor: tx.amount > 0 ? '#E8F5E9' : '#F5F5F5',
                            color: tx.amount > 0 ? '#2E7D32' : '#666',
                          }}
                        >
                          {tx.amount > 0 ? <ArrowDownward fontSize="small" /> : <ArrowUpward fontSize="small" />}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">{tx.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{tx.date} · {tx.category}</Typography>
                        </Box>
                      </Box>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        sx={{ color: tx.amount > 0 ? '#2E7D32' : 'text.primary' }}
                      >
                        {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                      </Typography>
                    </Box>
                    {index < transactions.length - 1 && <Divider />}
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <LoanApplicationCard />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #eee' }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Passkeys</Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <Divider component="div" />
                  <List sx={{ p: 0 }}>
                    <ListItem sx={{}}>
                      <ListItemText
                        primary="Passkey Registration"
                        secondary='Available'
                        slotProps={{ primary: { fontWeight: 'bold' } }}
                      />
                      <PasskeyRegistration onSuccess={() => setPasskeyRefreshTrigger((n: number) => n + 1)} />
                    </ListItem>
                    <Divider component="div" />
                    <ListItem sx={{ flexDirection: 'column', alignItems: 'stretch', py: 0 }}>
                      <ListItemText
                        primary="Registered Passkeys"
                        slotProps={{ primary: { fontWeight: 'bold' } }}
                        sx={{ pt: 1, px: 0 }}
                      />
                      <PasskeyList refreshTrigger={passkeyRefreshTrigger} />
                    </ListItem>
                  </List>
                </Grid>
              </Grid>
              
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #eee', height: '100%' }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Close your account</Typography>
              <Divider sx={{ mb: 3 }} />
              <Typography variant="body1" fontWeight="medium" sx={{ mb: 1 }}>
                Start the demo again
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                This permanently removes your Bank demo profile and registered passkeys from Cloud Directory, then signs you out.
              </Typography>
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteForever />}
                onClick={() => {
                  setCloseAccountError('');
                  setCloseAccountDialogOpen(true);
                }}
              >
                Close my account
              </Button>
            </Paper>
          </Grid>

        </Grid>
      </Container>

      <Dialog
        open={closeAccountDialogOpen}
        onClose={() => !isClosingAccount && setCloseAccountDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Close your account?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your demo account and registered passkeys will be permanently deleted. You will be signed out and returned to the home page.
          </Typography>
          {closeAccountError && <Alert severity="error" sx={{ mt: 2 }}>{closeAccountError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseAccountDialogOpen(false)} disabled={isClosingAccount}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleCloseAccount}
            disabled={isClosingAccount}
            startIcon={isClosingAccount ? <CircularProgress size={18} color="inherit" /> : <DeleteForever />}
          >
            {isClosingAccount ? 'Closing account' : 'Close my account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfilePage;
