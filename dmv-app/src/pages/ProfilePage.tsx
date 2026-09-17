import React, { ReactNode, useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
  useTheme,
  Stack,
  Button,
  CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid';
import defaultProfileImage from '../images/default-profile-male.jpeg';
import ActionCard from '../components/ActionCard';
import digitalLicense from '../images/digital-license.jpg';
import CustomDialog from '../components/CustomDialog';
import OfferImageDialog from '../components/OfferImageDialog';
import { Add } from '@carbon/icons-react';
import { View } from '@carbon/icons-react';
import { LicenseDetails } from '../components/LicenseDetails';
import { Copy } from '@carbon/icons-react';
import vciCredentialService from '../services/VciCredentialService';
import PasskeyRegistration from '../components/PasskeyRegistration';
import PasskeyList from '../components/PasskeyList';

// Define a type for our user profile data
interface DrivingPrivilege {
  vehicle_category_code: string;
  issue_date: string;
  expiry_date: string;
}

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  licenseNumber: string;
  licenseClass: string;
  issueDate: string;
  expiryDate: string;
  address: string;
  dateOfBirth: string;
  birthPlace: string;
  sex: string;
  height: number;
  weight: number;
  eyeColour: string;
  hairColour: string;
  ageInYears: number;
  birthYear: number;
  nationality: string;
  ageOver18: boolean;
  ageOver21: boolean;
  ageOver65: boolean;
  residentAddress: string;
  residentCity: string;
  residentState: string;
  residentPostalCode: string;
  residentCountry: string;
  administrativeNumber: string;
  issuingCountry: string;
  unDistinguishingSign: string;
  issuingAuthority: string;
  issuingJurisdiction: string;
  drivingPrivileges: Array<DrivingPrivilege>;
}

const ProfilePage: React.FC = () => {
  const theme = useTheme();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOfferDialogOpen, setIsOfferDialogOpen] = useState<boolean>(false);
  const [dialogTitle, setDialogTitle] = useState<string>('');
  const [dialogData, setDialogData] = useState<ReactNode | Blob | null>(null);
  const [isPageLoading, setIsPageLoading] = useState<boolean>(true);
  const [passkeyRefreshTrigger, setPasskeyRefreshTrigger] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Initialize the VciCredentialService and fetch the server-authoritative profile
  useEffect(() => {
    const initializeService = async () => {
      try {
        setIsPageLoading(true);
        await vciCredentialService.initialize();
        const response = await fetch('/auth/profile', { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`Failed to fetch profile: ${response.status}`);
        }
        const data = await response.json();
        setUserProfile(data);
      } catch (error) {
        console.error('Failed to initialise profile page:', error);
      } finally {
        setIsPageLoading(false);
      }
    };
    
    initializeService();
  }, []);

  const downloadLicense = async (): Promise<void> => {
    // Open the OfferImageDialog which will handle creating the offer and polling
    setIsOfferDialogOpen(true);
  }

  const handleDialogClose = () => {
    setDialogData(null);
    setDialogTitle('');
    setIsDialogOpen(false)
  }

  const viewLicenseDetails = () => {
    if (!userProfile) return;
    setIsDialogOpen(true);
    setDialogTitle('Additional information')
    setDialogData(<LicenseDetails userProfile={userProfile} />)
  }
  

  // Show loading screen while page is initializing
  if (isPageLoading) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: theme.palette.background.default
      }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading your profile...
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Please wait while we prepare your information.
        </Typography>
      </Box>
    );
  }

  if (!userProfile) {
    return null;
  }

  return (
    <>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 6 }}>
          <Typography variant="h3" component="h1" gutterBottom fontWeight="light">
            Welcome, {userProfile.firstName} {userProfile.lastName}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Manage your DMV services and digital credentials
          </Typography>
        </Box>

        <Grid container spacing={4}>
          <Grid size={{ xs: 12 }}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                height: '100%',
                borderRadius: 4,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: 'none',
                background: theme.palette.background.paper,
              }}>
              <Typography sx={{ mb: 2 }} variant="h6" component="h2" gutterBottom color={theme.palette.primary.dark}>
                Personal information
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <img src={defaultProfileImage} alt="" id='user-profile-image' />
                </Grid>
                <Grid size={{ xs: 12, sm: 10 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2, md: 3 }}>
                    <ListItem>
                      <ListItemText
                        primary="Family name"
                        secondary={userProfile.lastName}
                        secondaryTypographyProps={{ fontSize: '1rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                    </ListItem>
                    <ListItem>

                      <ListItemText
                        primary="Given name"
                        secondary={userProfile.firstName}
                        secondaryTypographyProps={{ fontSize: '1rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                    </ListItem>

                    <ListItem>
                      <ListItemText
                        primary="Date of birth"
                        secondary={userProfile.dateOfBirth}
                        secondaryTypographyProps={{ fontSize: '1rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                    </ListItem>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2, md: 3 }}>
                    <ListItem>
                      <ListItemText
                        primary="Gender"
                        secondary={userProfile.sex}
                        secondaryTypographyProps={{ fontSize: '1rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Email address"
                        secondary={userProfile.email}
                        secondaryTypographyProps={{ fontSize: '1rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Phone number"
                        secondary='+61 421 4302 210'
                        secondaryTypographyProps={{ fontSize: '1rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                    </ListItem>
                  </Stack>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
          {/* User Information Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                height: '100%',
                borderRadius: 4,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: 'none',
                background: theme.palette.background.paper,
              }}
            >
              <Box sx={{
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              >

                <Typography sx={{}} variant="h6" component="h2" gutterBottom color={theme.palette.primary.dark}>
                  License information
                </Typography>
                <Button
                  onClick={viewLicenseDetails}
                  variant="outlined"
                  startIcon={<View />}
                >
                  Additional
                </Button>
              </Box>
              <List disablePadding>
                <ListItem sx={{ p: 0, py: 1 }}>
                  <ListItemText
                    primary="License Number"
                    secondary={<>{userProfile.licenseNumber} <Copy /></>}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <Divider component="li" />
                <ListItem sx={{ p: 0, py: 1 }}>
                  <ListItemText
                    primary="Driving Privileges"
                    secondary={
                      <>
                        {userProfile.drivingPrivileges.map((p, i) => (
                          <span key={i}>{p.vehicle_category_code}{i < userProfile.drivingPrivileges.length - 1 && <br />}</span>
                        ))}
                      </>
                    }
                    secondaryTypographyProps={{ fontSize: '.875rem' }}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>

                <Divider component="li" />
                <Stack direction="row" spacing={3}>
                  <ListItem sx={{ p: 0, py: 1 }}>
                    <ListItemText
                      primary="Issue date"
                      secondary={userProfile.issueDate}
                      primaryTypographyProps={{ fontWeight: 'bold' }}
                    />
                  </ListItem>
                  <ListItem sx={{ p: 0, py: 1 }}>
                    <ListItemText
                      primary="Expiry date"
                      secondary={userProfile.expiryDate}
                      primaryTypographyProps={{ fontWeight: 'bold' }}
                    />
                  </ListItem>
                </Stack>
                <Divider component="li" />
                <ListItem sx={{ p: 0, py: 1 }}>
                  <ListItemText
                    primary="Issuing country"
                    secondary={userProfile.issuingCountry}
                    secondaryTypographyProps={{ fontSize: '.875rem' }}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
                <Divider component="li" />
                <ListItem sx={{ p: 0, py: 1 }}>
                  <ListItemText
                    primary="Issuing authority"
                    secondary={userProfile.issuingAuthority}
                    secondaryTypographyProps={{ fontSize: '.875rem' }}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                  />
                </ListItem>
              </List>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={3}
              sx={{
                borderRadius: 4,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: 'none',
                background: theme.palette.background.paper,
              }}
            >
              <Typography sx={{ mb: 1, p: 3, pb: 0 }} variant="h6" component="h2" gutterBottom color={theme.palette.primary.dark}>
                Digital Credentials
              </Typography>
              <Typography variant="body1" paragraph sx={{ px: 3 }}>
                Manage your mobile drivers license (mDL) across your personal devices.
              </Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <Divider component="div" />
                  <List sx={{ p: 0 }}>
                    <ListItem sx={{}}>
                      <ListItemText
                        primary="Mobile drivers license (mDL)"
                        secondary='Available'
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                      <Button
                        endIcon={<Add />}
                        variant='contained'
                        onClick={(e) => {
                          downloadLicense();
                        }}
                      >
                        Add to digital wallet
                      </Button>
                    </ListItem>
                    <Divider component="div" />
                    <ListItem sx={{}}>
                      <ListItemText
                        primary="Vehicle registration"
                        secondary='Coming soon'
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                      <Button disabled endIcon={<Add />} variant='contained'>Add to digital wallet</Button>
                    </ListItem>
                  </List>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
          
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={3}
              sx={{
                borderRadius: 4,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: 'none',
                background: theme.palette.background.paper,
              }}
            >
              <Typography sx={{ mb: 1, p: 3, pb: 0 }} variant="h6" component="h2" gutterBottom color={theme.palette.primary.dark}>
                Security
              </Typography>
              <Typography variant="body1" paragraph sx={{ px: 3 }}>
                Register a passkey to sign in to your account instead of a password.
              </Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <Divider component="div" />
                  <List sx={{ p: 0 }}>
                    <ListItem sx={{}}>
                      <ListItemText
                        primary="Passkey Registration"
                        secondary='Available'
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                      <PasskeyRegistration onSuccess={() => setPasskeyRefreshTrigger((n: number) => n + 1)} />
                    </ListItem>
                    <Divider component="div" />
                    <ListItem sx={{ flexDirection: 'column', alignItems: 'stretch', py: 0 }}>
                      <ListItemText
                        primary="Registered Passkeys"
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                        sx={{ pt: 1, px: 0 }}
                      />
                      <PasskeyList refreshTrigger={passkeyRefreshTrigger} />
                    </ListItem>
                  </List>
                </Grid>
              </Grid>
              
            </Paper>
          </Grid>

          {/* Available Services Card */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                borderRadius: 4,
                boxShadow: 'none',
                background: 'none',
              }}
            >
              <Divider component="div" />
              <Typography sx={{ my: 3 }} variant="h6" component="h2" gutterBottom color={theme.palette.primary.dark}>
                Service options
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6}}>
                  <ActionCard
                    title={'Digital license'}
                    body={'You can now add your digital license to your wallet. See how to get started.'}
                    buttonLabel={'More info'}
                    buttonDisabled={false}
                    imageSrc={digitalLicense} />
                </Grid>
              </Grid>
            </Paper>
          </Grid>
          
        </Grid>
      </Container >
      <CustomDialog
        maxWidth={'md'}
        title={dialogTitle}
        isOpen={isDialogOpen}
        isLoading={isLoading}
        handleClose={handleDialogClose}
        dialogData={dialogData}
      />
      <OfferImageDialog
        isOpen={isOfferDialogOpen}
        handleClose={() => setIsOfferDialogOpen(false)}
        triggerCreate={true}
      />
    </>
  );
};

export default ProfilePage;

// Made with Bob
