import { Box, Divider, List, ListItem, ListItemText, Typography } from '@mui/material';

interface EmploymentDetailsProps {
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

export const EmploymentDetails = ({ employeeProfile }: { employeeProfile: EmploymentDetailsProps }) => {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mt: 1, mb: 1, fontWeight: 'bold' }}>
        Employee details
      </Typography>
      <List disablePadding>
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Full name"
            secondary={`${employeeProfile.firstName} ${employeeProfile.lastName}`}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Employee ID"
            secondary={employeeProfile.employeeId}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Document number"
            secondary={employeeProfile.documentNumber}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Email"
            secondary={employeeProfile.email}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Work location"
            secondary={employeeProfile.workLocation}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
      </List>

      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
        Employment details
      </Typography>
      <List disablePadding>
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Employer customer"
            secondary={employeeProfile.employerName}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Employer entity"
            secondary={employeeProfile.employerEntityId}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Job title"
            secondary={employeeProfile.jobTitle}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Department"
            secondary={employeeProfile.department}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Employment type"
            secondary={employeeProfile.employmentType}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Employment status"
            secondary={employeeProfile.employmentStatus}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Start date"
            secondary={employeeProfile.startDate}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Manager"
            secondary={employeeProfile.managerName}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
      </List>

      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
        Compensation and issuer details
      </Typography>
      <List disablePadding>
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Annual salary"
            secondary={employeeProfile.annualIncome}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Pay frequency"
            secondary={employeeProfile.payFrequency}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem sx={{ p: 0, py: 1 }}>
          <ListItemText
            primary="Issuing authority"
            secondary={employeeProfile.issuingAuthority}
            secondaryTypographyProps={{ fontSize: '.875rem' }}
            primaryTypographyProps={{ fontWeight: 'bold' }}
          />
        </ListItem>
      </List>
    </Box>
  );
};