import { ListItem, ListItemText, Box, List, Divider, Typography } from "@mui/material"
import Grid from '@mui/material/Grid';

interface DrivingPrivilege {
  vehicle_category_code: string;
  issue_date: string;
  expiry_date: string;
}

interface UserProfileProps {
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

export const LicenseDetails = ({ userProfile }: { userProfile: UserProfileProps }) => {
    return (
        <Box>
            {/* Personal Information Section */}
            <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
                Personal Information
            </Typography>
            <List disablePadding>
                <Grid container>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Family Name"
                                secondary={userProfile.lastName}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Given Name"
                                secondary={userProfile.firstName}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Birth Date"
                                secondary={userProfile.dateOfBirth}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Birth Place"
                                secondary={userProfile.birthPlace}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Sex"
                                secondary={userProfile.sex}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Email"
                                secondary={userProfile.email}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Height (cm)"
                                secondary={userProfile.height}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Weight (kg)"
                                secondary={userProfile.weight}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Eye Colour"
                                secondary={userProfile.eyeColour}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Hair Colour"
                                secondary={userProfile.hairColour}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Age in Years"
                                secondary={userProfile.ageInYears}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Birth Year"
                                secondary={userProfile.birthYear}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Nationality"
                                secondary={userProfile.nationality}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Age Over 18"
                                secondary={userProfile.ageOver18 === true ? "Yes" : "No"}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Age Over 21"
                                secondary={userProfile.ageOver21 === true ? "Yes" : "No"}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Age Over 65"
                                secondary={userProfile.ageOver65 === true ? "Yes" : "No"}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
            </List>

            {/* Residence Information Section */}
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
                Residence Information
            </Typography>
            <List disablePadding>
                <ListItem sx={{ p: 0, py: 1 }}>
                    <ListItemText
                        primary="Resident Address"
                        secondary={userProfile.residentAddress}
                        secondaryTypographyProps={{ fontSize: '.875rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                    />
                </ListItem>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Resident City"
                                secondary={userProfile.residentCity}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Resident State"
                                secondary={userProfile.residentState}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Resident Postal Code"
                                secondary={userProfile.residentPostalCode}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Resident Country"
                                secondary={userProfile.residentCountry}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
            </List>

            {/* Document Information Section */}
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
                Document Information
            </Typography>
            <List disablePadding>
                <ListItem sx={{ p: 0, py: 1 }}>
                    <ListItemText
                        primary="Document Number"
                        secondary={userProfile.licenseNumber}
                        secondaryTypographyProps={{ fontSize: '.875rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                    />
                </ListItem>
                <Divider component="li" />
                
                <ListItem sx={{ p: 0, py: 1 }}>
                    <ListItemText
                        primary="Administrative Number"
                        secondary={userProfile.administrativeNumber}
                        secondaryTypographyProps={{ fontSize: '.875rem' }}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                    />
                </ListItem>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Issue Date"
                                secondary={userProfile.issueDate}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Expiry Date"
                                secondary={userProfile.expiryDate}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Issuing Country"
                                secondary={userProfile.issuingCountry}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="UN Distinguishing Sign"
                                secondary={userProfile.unDistinguishingSign}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
                <Divider component="li" />
                
                <Grid container>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Issuing Authority"
                                secondary={userProfile.issuingAuthority}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Issuing Jurisdiction"
                                secondary={userProfile.issuingJurisdiction}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                    </Grid>
                </Grid>
            </List>

            {/* Driving Privileges Section */}
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
                Driving Privileges
            </Typography>
            <List disablePadding>
                {userProfile.drivingPrivileges.map((privilege, index) => (
                    <Box key={index}>
                        <ListItem sx={{ p: 0, py: 1 }}>
                            <ListItemText
                                primary="Vehicle Category Code"
                                secondary={privilege.vehicle_category_code}
                                secondaryTypographyProps={{ fontSize: '.875rem' }}
                                primaryTypographyProps={{ fontWeight: 'bold' }}
                            />
                        </ListItem>
                        <Grid container>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <ListItem sx={{ p: 0, py: 1 }}>
                                    <ListItemText
                                        primary="Issue Date"
                                        secondary={privilege.issue_date}
                                        secondaryTypographyProps={{ fontSize: '.875rem' }}
                                        primaryTypographyProps={{ fontWeight: 'bold' }}
                                    />
                                </ListItem>
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <ListItem sx={{ p: 0, py: 1 }}>
                                    <ListItemText
                                        primary="Expiry Date"
                                        secondary={privilege.expiry_date}
                                        secondaryTypographyProps={{ fontSize: '.875rem' }}
                                        primaryTypographyProps={{ fontWeight: 'bold' }}
                                    />
                                </ListItem>
                            </Grid>
                        </Grid>
                        {index < userProfile.drivingPrivileges.length - 1 && <Divider component="li" />}
                    </Box>
                ))}
            </List>
        </Box>
    )
}

// Made with Bob
