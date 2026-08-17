import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  useTheme
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { CheckCircle, ArrowForward } from '@mui/icons-material';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accountType: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  birthDate: string;
}

const SuccessPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  
  // Check if user has completed verification and form submission
  useEffect(() => {
    // If no state or verification status is not true, redirect to signup page
    if (!location.state || !location.state.verificationCompleted) {
      navigate('/', { replace: true });
    }
  }, [location.state, navigate]);
  
  const formData = location.state?.formData as FormData || {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '555-123-4567',
    accountType: 'checking',
    address: '123 High St',
    city: 'Gold Coast',
    state: 'QLD',
    country: 'Australia',
    zipCode: '4217',
    birthDate: '1990-01-15'
  };

  const accountTypeLabels: Record<string, string> = {
    checking: 'Checking Account',
    savings: 'Savings Account',
    business: 'Business Account'
  };

  const accountNumber = Math.floor(Math.random() * 9000000000) + 1000000000;
  const routingNumber = '074000078';

  return (
    <Container maxWidth="md" sx={{ textAlign: 'center', py: 8 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mb: 6
        }}
      >
        <CheckCircle
          sx={{
            fontSize: 80,
            color: 'success.main',
            mb: 2
          }}
        />
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          Account Created Successfully!
        </Typography>
        <Typography variant="h6" sx={{ maxWidth: 600, mb: 4 }}>
          Thank you for choosing Smart Money Bank. Your account has been created and is ready to use.
        </Typography>
      </Box>

      <Paper
        elevation={3}
        sx={{
          p: 0,
          borderRadius: 2,
          overflow: 'hidden',
          mb: 4
        }}
      >
        <Box sx={{
          bgcolor: theme.palette.primary.main,
          color: 'white',
          p: 2,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8
        }}>
          <Typography variant="h5" component="h2">
            Account Details
          </Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <List disablePadding>
                <ListItem>
                  <ListItemText
                    primary="Account Holder"
                    secondary={`${formData.firstName} ${formData.lastName}`}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Account Type"
                    secondary={accountTypeLabels[formData.accountType]}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Account Number"
                    secondary={accountNumber}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Routing Number"
                    secondary={routingNumber}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
              </List>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <List disablePadding>
                <ListItem>
                  <ListItemText
                    primary="Email"
                    secondary={formData.email}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Phone"
                    secondary={formData.phone}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Date of Birth"
                    secondary={formData.birthDate}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Address"
                    secondary={`${formData.address}, ${formData.city}, ${formData.state} ${formData.zipCode} ${formData.country}`}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
              </List>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      <Typography variant="body1" sx={{ mb: 4 }}>
        You will receive an email with your account details and next steps.
      </Typography>

      <Button
        variant="contained"
        color="primary"
        size="large"
        endIcon={<ArrowForward />}
        onClick={() => navigate('/')}
        sx={{
          px: 4,
          py: 1.5,
          borderRadius: 2
        }}
      >
        Return to Home
      </Button>
    </Container>
  );
};

export default SuccessPage;
