import React, { ReactNode, useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useAuth } from '../components/AuthProvider';
import CustomDialog from '../components/CustomDialog';
import { EmploymentDetails } from '../components/EmploymentDetails';
import OfferImageDialog from '../components/OfferImageDialog';

interface EmployeeProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
  documentNumber: string;
  employerName: string;
  employerEntityId: string;
  jobTitle: string;
  department: string;
  employmentStatus: string;
  employmentType: string;
  startDate: string;
  annualIncome: string;
  payFrequency: string;
  workLocation: string;
  managerName: string;
  issuingAuthority: string;
}

const PortalHomePage: React.FC = () => {
  const { user } = useAuth();
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogData, setDialogData] = useState<ReactNode | Blob | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEmploymentOfferDialogOpen, setIsEmploymentOfferDialogOpen] = useState(false);
  const [employeeProfile, setEmployeeProfile] = useState<EmployeeProfile>({
    id: 'employee-10017',
    firstName: 'Mia',
    lastName: 'Kerr',
    email: 'mia.kerr@examplecorp.test',
    employeeId: 'EMP-48217',
    documentNumber: 'POE-2026-48217',
    employerName: 'International Business Machines',
    employerEntityId: 'ABN 12 345 678 901',
    jobTitle: 'Technical Specialist',
    department: 'Engineering',
    employmentStatus: 'Active',
    employmentType: 'Full-time, permanent',
    startDate: '2021-07-12',
    annualIncome: 'AUD 98,400',
    payFrequency: 'Fortnightly',
    workLocation: 'Brisbane, QLD',
    managerName: 'Elena Park',
    issuingAuthority: 'HR Portal Credential Services',
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    setEmployeeProfile((previous: EmployeeProfile) => ({
      ...previous,
      id: user.profile?.sub || previous.id,
      firstName: user.profile?.given_name || previous.firstName,
      lastName: user.profile?.family_name || previous.lastName,
      email: user.profile?.email || previous.email,
    }));
  }, [user]);

  const displayName = `${employeeProfile.firstName} ${employeeProfile.lastName}`;

  const openEmploymentOfferDialog = () => {
    setIsEmploymentOfferDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogData(null);
    setDialogTitle('');
    setIsDialogOpen(false);
  };

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={500}>
        {value}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f9fafb', py: 8 }}>
      <Container maxWidth="md">
        <Stack spacing={4}>
          <Box sx={{ textAlign: 'center', mb: 2 }}>
            <Avatar
              sx={{
                width: 80,
                height: 80,
                bgcolor: '#111827',
                fontSize: '1.75rem',
                fontWeight: 600,
                mx: 'auto',
                mb: 2,
              }}
            >
              {employeeProfile.firstName[0]}{employeeProfile.lastName[0]}
            </Avatar>
            <Typography variant="h4" component="h1" fontWeight={600} color="#111827">
              {displayName}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              {employeeProfile.jobTitle} at {employeeProfile.employerName}
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  border: '1px solid #e5e7eb',
                  borderRadius: 2,
                  height: '100%',
                }}
              >
                <Typography variant="subtitle2" sx={{ letterSpacing: 1, textTransform: 'uppercase', color: '#6b7280', mb: 2 }}>
                  Identity Details
                </Typography>
                <InfoRow label="Employee ID" value={employeeProfile.employeeId} />
                <Divider sx={{ borderColor: '#f3f4f6' }} />
                <InfoRow label="Document number" value={employeeProfile.documentNumber} />
                <Divider sx={{ borderColor: '#f3f4f6' }} />
                <InfoRow label="Email" value={employeeProfile.email} />
                <Divider sx={{ borderColor: '#f3f4f6' }} />
                <InfoRow label="Department" value={employeeProfile.department} />
                <Divider sx={{ borderColor: '#f3f4f6' }} />
                <InfoRow label="Work Location" value={employeeProfile.workLocation} />
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  border: '1px solid #e5e7eb',
                  borderRadius: 2,
                  height: '100%',
                }}
              >
                <Typography variant="subtitle2" sx={{ letterSpacing: 1, textTransform: 'uppercase', color: '#6b7280', mb: 2 }}>
                  Employment details
                </Typography>
                <InfoRow label="Employer Entity" value={employeeProfile.employerEntityId} />
                <Divider sx={{ borderColor: '#f3f4f6' }} />
                <InfoRow label="Employment Type" value={employeeProfile.employmentType} />
                <Divider sx={{ borderColor: '#f3f4f6' }} />
                <InfoRow label="Status" value={employeeProfile.employmentStatus} />
                <Divider sx={{ borderColor: '#f3f4f6' }} />
                <InfoRow label="Start Date" value={employeeProfile.startDate} />
              </Paper>
            </Grid>
          </Grid>

          <Paper
            elevation={0}
            sx={{
              p: 4,
              border: '1px solid #e5e7eb',
              borderRadius: 2,
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 3,
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight={600} color="#111827">
                Proof of Employment
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Issue a verifiable credential directly to your digital wallet.
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="primary"
              disableElevation
              onClick={openEmploymentOfferDialog}
              sx={{ px: 4, py: 1.5, whiteSpace: 'nowrap' }}
            >
              Issue to Wallet
            </Button>
          </Paper>
        </Stack>
      </Container>

      <OfferImageDialog
        isOpen={isEmploymentOfferDialogOpen}
        handleClose={() => setIsEmploymentOfferDialogOpen(false)}
        triggerCreate={true}
        userProfile={employeeProfile}
      />
      <CustomDialog
        maxWidth={'md'}
        title={dialogTitle}
        isOpen={isDialogOpen}
        isLoading={false}
        handleClose={handleDialogClose}
        dialogData={dialogData}
      />
    </Box>
  );
};

export default PortalHomePage;