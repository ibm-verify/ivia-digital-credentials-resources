import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import diagencyApiService from '../services/DiagencyApiService';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  MenuItem,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  Link
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  ArrowForward,
  ArrowBack,
  QrCode2,
  CheckCircle
} from '@mui/icons-material';
import QRCode from 'qrcode';
import { useAuth } from '../components/AuthProvider';

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

const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { completeVerifiedSignup } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    accountType: 'savings',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    birthDate: '',
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [signupError, setSignupError] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  interface VerificationRequest {
    qr: string;
    exchangeId: string;
    walletEngagement: string;
  }
  
  const [verificationRequest, setVerificationRequest] = useState<VerificationRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData({ ...formData, [id]: value });
    setSignupError('');
  };

  const handleNextStep = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBackStep = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  // Handle dialog close and reset verification state
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    // Reset verification request to clear the exchangeId
    setVerificationRequest(null);
    // Reset verification state for a fresh start
    setIsVerifying(false);
  };

  const setFormDataFromVerificationResponse = useCallback(async () => {
    if (!verificationRequest) return;
    
    try {
      // Make API call to get verification response
      const data = await diagencyApiService.unauthenticatedRequest(
        `/credentials/verifiable/presentation/vc`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      // Default license data
      const licenseData = getDefaultLicenseData();
      
      // Process attributes if available
      // const attributes = data.oid4vp?.[0]?.decoded?.attributes;
      const attributes = data.attributes;
      if (!attributes) {
        setVerificationError('Failed to obtain attributes from verification.');
        return;
      }
      
      // Map attributes to license data
      updateLicenseDataFromAttributes(licenseData, attributes);
        
      // Update form with license data
      updateFormWithLicenseData(licenseData);

    } catch (error: any) {
      handleVerificationError(error);
    }
  }, [verificationRequest]);

  // Helper functions to reduce complexity
  const getDefaultLicenseData = () => ({
    firstName: 'John',
    lastName: 'Doe',
    address: '123 High Street',
    city: 'Gold Coast',
    state: 'QLD',
    zipCode: '4217',
    country: 'Australia',
    birthDate: '1990-01-15'
  });

  const updateLicenseDataFromAttributes = (licenseData: any, attributes: any[]) => {
    // Mapping of attribute IDs to license data fields
    const attributeMapping: Record<string, keyof typeof licenseData> = {
      "given_name": "firstName",
      "family_name": "lastName",
      "resident_address": "address",
      "resident_city": "city",
      "resident_state": "state",
      "resident_postal_code": "zipCode",
      "resident_country": "country",
      "birth_date": "birthDate"
    };
    
    // Update license data based on attribute mapping
    for (const attribute of attributes) {
      const field = attributeMapping[attribute.id];
      if (field) {
        licenseData[field] = attribute.value;
      }
    }
  };

  const updateFormWithLicenseData = (licenseData: any) => {
    setFormData(prevData => ({
      ...prevData,
      firstName: licenseData.firstName,
      lastName: licenseData.lastName,
      address: licenseData.address,
      city: licenseData.city,
      state: licenseData.state,
      zipCode: licenseData.zipCode,
      country: licenseData.country,
      birthDate: licenseData.birthDate
    }));
  };

  const handleVerificationError = (error: any) => {
    setVerificationError(`Verification failed retrieving verification attributes: ${error.message || 'Please try again.'}`);
    setIsVerifying(false);
  };

  // Function to check verification status - this is the only polling mechanism
  useEffect(() => {
    if (!verificationRequest) return; // only start when we have an exchangeId

    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      // capture exchangeId now so we don't rely on stale state inside the poll
      const exchangeId = verificationRequest.exchangeId;
      try {
        const data = await diagencyApiService.unauthenticatedRequest(
          `/credentials/verifiable/presentation`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (!mounted) return;

        if (data.execution_state === 'success') {
          // pull form data from response (await if needed)
          await setFormDataFromVerificationResponse();
          setIsDialogOpen(false);
          setVerificationSuccess(true);
          setIsVerifying(false);
          // clear the request since it's finished
          setVerificationRequest(null);
          
          // Set a timeout to automatically navigate to the next step after showing success message
          setTimeout(() => {
            handleNextStep();
          }, 1500); // Show success message for 1.5 seconds before moving on
        } else if (data.execution_state === 'error') {
          setVerificationError('Verification failed. Please try again.');
          setIsDialogOpen(false);
          setIsVerifying(false);
          setVerificationRequest(null);
        } else if (data.execution_state === 'expired') {
          setVerificationError('Verification expired. Please try again.');
          setIsDialogOpen(false);
          setIsVerifying(false);
          setVerificationRequest(null);
        } else {
          // still pending -> schedule next poll
          timeoutId = setTimeout(poll, 3000);
        }
      } catch (err: any) {
        if (!mounted) return;
        // Only keep retrying while the dialog is open (same logic you had)
        if (isDialogOpen) {
          timeoutId = setTimeout(poll, 3000);
        } else {
          setVerificationError(`Verification failed: ${err?.message ?? 'Please try again.'}`);
          setIsVerifying(false);
        }
      }
    };

    // start polling immediately
    poll();

    // cleanup on unmount or when verificationRequest changes
    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    verificationRequest,
    isDialogOpen,
    setFormDataFromVerificationResponse
  ]);

  const handleVerifyIdentity = async () => {
    setIsVerifying(true);
    setVerificationError('');
    
    try {
      // Make API call to verify identity with driver's license using our API service
      const data = await diagencyApiService.unauthenticatedRequest('/credentials/verifiable/presentation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          with_qr_code: true
        }
      });
      
      // Get the exchange ID from the response
      const exchangeId = data.id;
      let qrcode = data.qr;
      const wallet_engagement = data.wallet_engagement;
      
      if (!exchangeId) {
        throw new Error('No exchange ID received from server');
      }

      // If diagency failed to return a QR code in the payload then we need to create our own
      if (!qrcode && wallet_engagement) {
        qrcode = await QRCode.toDataURL(wallet_engagement); 
      }
      
      // Open dialog with QR code from the API response
      setVerificationRequest({
        qr: qrcode, 
        exchangeId: exchangeId, // Store the exchange ID for status checking
        walletEngagement: wallet_engagement
      });
      setIsDialogOpen(true);
      
    } catch (error: any) {
      setVerificationError(`Failed to initiate verification: ${error.message || 'Unknown error'}`);
      setVerificationRequest(null);
    } finally {
      setIsVerifying(false); 
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only allow navigation to success page if verification was successful
    if (!verificationSuccess) {
      // Show error if user tries to submit without verification
      setVerificationError('Please complete identity verification before submitting.');
      setActiveStep(0); // Go back to verification step
      return;
    }

    setIsSubmitting(true);
    setSignupError('');

    try {
      const signupResult = await diagencyApiService.unauthenticatedRequest<{
        userInfo: Record<string, unknown>;
      }>('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: formData
      });

      completeVerifiedSignup(signupResult.userInfo);
      navigate('/profile', { replace: true });
    } catch (error: any) {
      setSignupError(`Signup failed: ${error.message || 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    {
      label: 'Identity Verification',
      description: 'Scan your driver\'s license',
      content: (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Identity Verification
          </Typography>
          <Typography variant="body1" paragraph>
            Please scan your digital driver's license to quickly and securely verify your identity.
            This will help us pre-fill your information in the next step.
          </Typography>

          {verificationError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {verificationError}
            </Alert>
          )}

          {verificationSuccess ? (
            <Alert
              icon={<CheckCircle fontSize="inherit" />}
              severity="success"
              sx={{ mb: 2 }}
            >
              Identity verified successfully!
            </Alert>
          ) : (
            <Button
              variant="contained"
              color="primary"
              onClick={handleVerifyIdentity}
              disabled={isVerifying}
              startIcon={isVerifying ? <CircularProgress size={20} /> : <QrCode2 />}
              sx={{ mb: 2 }}
            >
              {isVerifying ? 'Verifying...' : 'Scan Digital Driver\'s License'}
            </Button>
          )}

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleNextStep}
              endIcon={<ArrowForward />}
              disabled={!verificationSuccess}
            >
              Next: Personal Information
            </Button>
          </Box>
        </Box>
      )
    },
    {
      label: 'Personal Information',
      description: 'Review your pre-filled details',
      content: (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Personal Information
          </Typography>
          <Alert severity="info" sx={{ mb: 3 }}>
            We have pre-filled your personal information from your digital credential.
          </Alert>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                id="firstName"
                label="First Name"
                variant="outlined"
                fullWidth
                value={formData.firstName}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                id="lastName"
                label="Last Name"
                variant="outlined"
                fullWidth
                value={formData.lastName}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                id="birthDate"
                label="Birth Date"
                variant="outlined"
                fullWidth
                value={formData.birthDate}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                id="address"
                label="Address"
                variant="outlined"
                fullWidth
                value={formData.address}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                id="city"
                label="City"
                variant="outlined"
                fullWidth
                value={formData.city}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                id="state"
                label="State"
                variant="outlined"
                fullWidth
                value={formData.state}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                id="zipCode"
                label="ZIP Code"
                variant="outlined"
                fullWidth
                value={formData.zipCode}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                id="country"
                label="Country"
                variant="outlined"
                fullWidth
                value={formData.country}
                InputProps={{
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              onClick={handleBackStep}
              startIcon={<ArrowBack />}
            >
              Back
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleNextStep}
              endIcon={<ArrowForward />}
              size="large"
            >
              Next: Account Details
            </Button>
          </Box>
        </Box>
      )
    },
    {
      label: 'Account Details and Contact Information',
      description: 'Choose account type and contact information',
      content: (
        <Box sx={{ mt: 4 }} component="form" onSubmit={handleSubmit}>
          {signupError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {signupError}
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                id="accountType"
                select
                label="Account Type"
                variant="outlined"
                fullWidth
                value={formData.accountType}
                onChange={handleInputChange}
                required
              >
                <MenuItem value="checking">Checking Account</MenuItem>
                <MenuItem value="savings">Savings Account</MenuItem>
                <MenuItem value="business">Business Account</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                id="email"
                label="Email"
                type="email"
                variant="outlined"
                fullWidth
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                id="phone"
                label="Phone Number"
                variant="outlined"
                fullWidth
                value={formData.phone}
                onChange={handleInputChange}
                required
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              onClick={handleBackStep}
              startIcon={<ArrowBack />}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={20} /> : undefined}
            >
              {isSubmitting ? 'Creating Account...' : 'Complete Application'}
            </Button>
          </Box>
        </Box>
      )
    }
  ];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 6, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
          Open a Savings Account
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Complete the form below to open a new savings account with Smart Money Bank.
        </Typography>
      </Box>

      <Paper
        elevation={3}
        sx={{
          p: 4,
          borderRadius: 2,
          background: `linear-gradient(to right bottom, ${theme.palette.background.paper}, ${theme.palette.background.default})`,
          boxShadow: theme.shadows[10]
        }}
      >
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel>
                <Typography variant="subtitle1" fontWeight="medium">
                  {step.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {step.description}
                </Typography>
              </StepLabel>
              <StepContent>
                {step.content}
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* QR Code Dialog */}
      <Dialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Scan to Verify Identity</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', p: 2 }}>
            {verificationRequest && (
              <>
                {verificationRequest.qr ? (
                  // Display QR code from the qr field which already includes the data:image/png;base64 prefix
                  <Box sx={{ mb: 2 }}>
                    <img
                      src={verificationRequest.qr}
                      alt="QR Code"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                  </Box>
                ) : (
                  // Fallback to icon if no QR code image
                  <QrCode2 sx={{ fontSize: 100, color: theme.palette.primary.main, mb: 2 }} />
                )}
                <Typography variant="body1" paragraph>
                  Scan this QR code with your digital wallet app to verify your identity.
                </Typography>
                <Link
                  href={verificationRequest.walletEngagement}
                  underline="hover"
                  sx={{
                    mt: 2,
                    display: 'block',
                    textAlign: 'center',
                    color: 'primary.main',
                    fontWeight: 'medium',
                    cursor: 'pointer'
                  }}
                >
                  Or click here to verify using a wallet on this device
                </Link>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SignupPage;

// Made with Bob
