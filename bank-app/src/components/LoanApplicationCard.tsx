import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { CheckCircle, QrCode2 } from '@mui/icons-material';
import QRCode from 'qrcode';
import diagencyApiService from '../services/DiagencyApiService';

interface VerificationRequest {
  qr: string;
  exchangeId: string;
  walletEngagement: string;
}

interface VerifiedEmploymentData {
  firstName: string;
  lastName: string;
  annualIncome: string;
}

interface LoanFormData {
  loanAmount: string;
  loanPurpose: string;
  repaymentTerm: string;
  phone: string;
}

interface CredentialAttribute {
  id: string;
  value: string;
}

const defaultEmploymentData: VerifiedEmploymentData = {
  firstName: '',
  lastName: '',
  annualIncome: '',
};

const getAttributeValue = (attributes: CredentialAttribute[], id: string) => (
  attributes.find((attribute) => attribute.id === id)?.value || ''
);

const LoanApplicationCard: React.FC = () => {
  const theme = useTheme();
  const [verificationRequest, setVerificationRequest] = useState<VerificationRequest | null>(null);
  const [employmentData, setEmploymentData] = useState<VerifiedEmploymentData>(defaultEmploymentData);
  const [loanFormData, setLoanFormData] = useState<LoanFormData>({
    loanAmount: '10000',
    loanPurpose: 'home-improvement',
    repaymentTerm: '36',
    phone: '',
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [applicationError, setApplicationError] = useState('');

  const closeDialog = () => {
    setIsDialogOpen(false);
    setVerificationRequest(null);
    setIsVerifying(false);
  };

  const setEmploymentDataFromVerificationResponse = useCallback(async () => {
    const data = await diagencyApiService.unauthenticatedRequest('/credentials/verifiable/presentation/employment/vc', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const attributes = data.attributes as CredentialAttribute[] | undefined;
    if (!attributes?.length) {
      throw new Error('Failed to obtain employment attributes from verification.');
    }

    setEmploymentData({
      firstName: getAttributeValue(attributes, 'given_name'),
      lastName: getAttributeValue(attributes, 'family_name'),
      annualIncome: getAttributeValue(attributes, 'annual_income'),
    });
  }, []);

  useEffect(() => {
    if (!verificationRequest) return;

    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const data = await diagencyApiService.unauthenticatedRequest('/credentials/verifiable/presentation/employment', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!mounted) return;

        if (data.execution_state === 'success') {
          await setEmploymentDataFromVerificationResponse();
          setVerificationSuccess(true);
          setVerificationError('');
          setIsVerifying(false);
          setIsDialogOpen(false);
          setVerificationRequest(null);
          return;
        }

        if (data.execution_state === 'error' || data.execution_state === 'expired') {
          const failureReason = data.error_description || data.error || data.message;
          setVerificationError(data.execution_state === 'expired'
            ? 'Employment verification expired. Please try again.'
            : `Employment verification failed${failureReason ? `: ${failureReason}` : '. Please try again.'}`);
          setIsVerifying(false);
          setIsDialogOpen(false);
          setVerificationRequest(null);
          return;
        }

        timeoutId = setTimeout(poll, 3000);
      } catch (error: any) {
        if (!mounted) return;

        if (isDialogOpen) {
          timeoutId = setTimeout(poll, 3000);
          return;
        }

        setVerificationError(`Employment verification failed: ${error?.message || 'Please try again.'}`);
        setIsVerifying(false);
      }
    };

    poll();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [verificationRequest, isDialogOpen, setEmploymentDataFromVerificationResponse]);

  const handleStartEmploymentVerification = async () => {
    setIsVerifying(true);
    setVerificationError('');
    setApplicationError('');
    setApplicationSubmitted(false);

    try {
      // No body parameters — the server determines the exchange type from the URL path.
      const data = await diagencyApiService.unauthenticatedRequest('/credentials/verifiable/presentation/employment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const exchangeId = data.id;
      const walletEngagement = data.wallet_engagement;
      let qr = data.qr;

      if (!exchangeId) {
        throw new Error('No employment exchange ID received from server.');
      }

      if (!qr && walletEngagement) {
        qr = await QRCode.toDataURL(walletEngagement);
      }

      setVerificationRequest({ qr, exchangeId, walletEngagement });
      setIsDialogOpen(true);
    } catch (error: any) {
      setVerificationError(`Failed to start employment verification: ${error.message || 'Unknown error'}`);
      setVerificationRequest(null);
      setIsVerifying(false);
    }
  };

  const handleLoanInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = event.target;
    setLoanFormData((previous) => ({ ...previous, [id]: value }));
    setApplicationError('');
  };

  const handleLoanSelectChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setLoanFormData((previous) => ({ ...previous, [name]: value }));
    setApplicationError('');
  };

  const handleSubmitLoanApplication = (event: React.FormEvent) => {
    event.preventDefault();

    if (!verificationSuccess) {
      setApplicationError('Verify your proof of employment credential before applying.');
      return;
    }

    setApplicationSubmitted(true);
    setApplicationError('');
  };

  const applicantName = `${employmentData.firstName} ${employmentData.lastName}`.trim();

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        border: '1px solid #E3E3FF',
        background: 'linear-gradient(135deg, #F7F7FF 0%, #FFFFFF 58%, #F1FFF8 100%)',
      }}
    >
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              Pre-qualified offer
            </Typography>
            <Typography variant="h5" fontWeight="bold">
              You are eligible for up to $10,000
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Verify your proof of employment credential to pre-fill your loan application.
            </Typography>
          </Box>
          {!verificationSuccess && (
            <Button
              variant="contained"
              startIcon={isVerifying ? <CircularProgress color="inherit" size={18} /> : <QrCode2 />}
              onClick={handleStartEmploymentVerification}
              disabled={isVerifying}
              sx={{ alignSelf: 'center', px: 3 }}
            >
              {isVerifying ? 'Waiting for wallet...' : 'Apply for Loan'}
            </Button>
          )}
        </Box>

        {verificationError && <Alert severity="error">{verificationError}</Alert>}

        {verificationSuccess && (
          <Alert icon={<CheckCircle fontSize="inherit" />} severity="success">
            Employment verified. Your application details have been pre-filled from your credential.
          </Alert>
        )}

        {verificationSuccess && (
          <Box component="form" onSubmit={handleSubmitLoanApplication}>
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField label="Applicant" value={applicantName} fullWidth disabled />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField label="Annual income" value={employmentData.annualIncome} fullWidth disabled />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  id="loanAmount"
                  label="Loan amount"
                  value={loanFormData.loanAmount}
                  onChange={handleLoanInputChange}
                  fullWidth
                  required
                  type="number"
                  inputProps={{ min: 1000, max: 10000, step: 500 }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  name="loanPurpose"
                  select
                  label="Loan purpose"
                  value={loanFormData.loanPurpose}
                  onChange={handleLoanSelectChange}
                  fullWidth
                  required
                >
                  <MenuItem value="home-improvement">Home improvement</MenuItem>
                  <MenuItem value="vehicle">Vehicle</MenuItem>
                  <MenuItem value="education">Education</MenuItem>
                  <MenuItem value="personal">Personal expenses</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  name="repaymentTerm"
                  select
                  label="Repayment term"
                  value={loanFormData.repaymentTerm}
                  onChange={handleLoanSelectChange}
                  fullWidth
                  required
                >
                  <MenuItem value="12">12 months</MenuItem>
                  <MenuItem value="24">24 months</MenuItem>
                  <MenuItem value="36">36 months</MenuItem>
                  <MenuItem value="48">48 months</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  id="phone"
                  label="Contact phone"
                  value={loanFormData.phone}
                  onChange={handleLoanInputChange}
                  fullWidth
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="contained" size="large" sx={{ px: 4 }}>
                  Apply for Loan
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}

        {applicationError && <Alert severity="error">{applicationError}</Alert>}
        {applicationSubmitted && (
          <Alert severity="success">
            Loan application submitted for review. We used your verified employment credential for eligibility assessment.
          </Alert>
        )}
      </Stack>

      <Dialog open={isDialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Verify Proof of Employment</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', p: 2 }}>
            {verificationRequest && (
              <>
                {verificationRequest.qr ? (
                  <Box sx={{ mb: 2 }}>
                    <img
                      src={verificationRequest.qr}
                      alt="Proof of employment verification QR code"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                  </Box>
                ) : (
                  <QrCode2 sx={{ fontSize: 100, color: theme.palette.primary.main, mb: 2 }} />
                )}
                <Typography variant="body1" paragraph>
                  Scan this QR code with your digital wallet to verify your proof of employment credential.
                </Typography>
                <Link
                  href={verificationRequest.walletEngagement}
                  underline="hover"
                  sx={{ mt: 2, display: 'block', textAlign: 'center', color: 'primary.main', fontWeight: 'medium' }}
                >
                  Or click here to verify using a wallet on this device
                </Link>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default LoanApplicationCard;