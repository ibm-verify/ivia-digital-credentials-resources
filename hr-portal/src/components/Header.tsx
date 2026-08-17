import React from 'react';
import { AppBar, Avatar, Box, IconButton, Menu, MenuItem, Tooltip, Toolbar } from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import { useAuth } from './AuthProvider';

export interface HeaderProps {
  isLoggedIn: boolean;
  user?: any;
}

export const Header = ({ isLoggedIn, user }: HeaderProps) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      setAnchorEl(null);
      await logout();
      // window.location.href = '/login';
    } catch {
      // window.location.href = '/login';
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  function stringToColor(value: string = 'HR User') {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = value.charCodeAt(index) + ((hash << 5) - hash);
    }

    let color = '#';

    for (let index = 0; index < 3; index += 1) {
      const channel = (hash >> (index * 8)) & 0xff;
      color += `00${channel.toString(16)}`.slice(-2);
    }

    return color;
  }

  function stringAvatar(name: string = 'HR User') {
    if (typeof name !== 'string' || !name.includes(' ')) {
      return {
        sx: {
          bgcolor: stringToColor('HR User'),
          mr: 1,
        },
        children: 'HU',
      };
    }

    const nameParts = name.split(' ');
    return {
      sx: {
        bgcolor: stringToColor(name),
        mr: 1,
      },
      children: `${nameParts[0][0]}${nameParts[1][0]}`,
    };
  }

  const userName = user?.name || user?.profile?.name || 'HR User';

  return (
    <AppBar position="static" color="primary" elevation={4}>
      <Toolbar>
        <Box display="flex" alignItems="center" sx={{ flexGrow: 1, gap: 1.5 }}>
          <Box
            component="img"
            src="/logo.svg"
            alt="HR Portal logo"
            sx={{ height: 32, width: 'auto', display: 'block' }}
          />
          <div className="app-title">HR Portal Employment Credential Issuer</div>
        </Box>

        {isLoggedIn && (
          <>
            <Tooltip title="Account settings">
              <IconButton
                onClick={handleMenuOpen}
                size="small"
                sx={{ ml: 2 }}
                aria-controls={Boolean(anchorEl) ? 'account-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={Boolean(anchorEl) ? 'true' : undefined}
              >
                <Avatar {...stringAvatar(userName)} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={anchorEl}
              id="account-menu"
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={handleLogout}>
                <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
                Logout
              </MenuItem>
            </Menu>
          </>
        )}
      </Toolbar>
    </AppBar>
  );
};