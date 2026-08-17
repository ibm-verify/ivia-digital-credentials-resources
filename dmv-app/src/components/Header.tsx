import { AppBar, Toolbar, Box, Tooltip, IconButton, Avatar, Menu, MenuItem } from "@mui/material"
import { Logout as LogoutIcon } from '@mui/icons-material';
import React from "react";
import { useAuth } from "./AuthProvider";

export interface HeaderProps {
    isLoggedIn: boolean;
    user?: any;
}

export const Header = ({ isLoggedIn, user }: HeaderProps) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const { logout } = useAuth();

    const handleLogout = async () => {
        try {
            // Close the menu
            setAnchorEl(null);
            
            // Call the logout method from AuthContext, which will redirect to the logout callback route and login screen
            await logout();

        } catch (error) {            
            // Clear any session storage manually as a fallback
            const storageKeys = Object.keys(sessionStorage);
            const oidcKeys = storageKeys.filter(key => key.startsWith('oidc.'));
            oidcKeys.forEach(key => sessionStorage.removeItem(key));
            
            // Even if there's an error, try to redirect to login
            window.location.href = '/login';
        }
    };

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    function stringToColor(string: string = 'User') {
        let hash = 0;
        let i;

        /* eslint-disable no-bitwise */
        for (i = 0; i < string.length; i += 1) {
            hash = string.charCodeAt(i) + ((hash << 5) - hash);
        }

        let color = '#';

        for (i = 0; i < 3; i += 1) {
            const value = (hash >> (i * 8)) & 0xff;
            color += `00${value.toString(16)}`.slice(-2);
        }
        /* eslint-enable no-bitwise */

        return color;
    }

    function stringAvatar(name: string = 'User Name') {
        // Ensure name is a string and has at least two parts
        if (typeof name !== 'string' || !name.includes(' ')) {
            return {
                sx: {
                    bgcolor: stringToColor('User Name'),
                    mr: 1
                },
                children: 'UN',
            };
        }

        const nameParts = name.split(' ');
        return {
            sx: {
                bgcolor: stringToColor(name),
                mr: 1
            },
            children: `${nameParts[0][0]}${nameParts[1][0]}`,
        };
    }

    // Ensure user and user.name exist
    const userName = user && user.name ? user.name : 
                    (user && user.profile && user.profile.name ? user.profile.name : 'User Name');

    return (
        <AppBar position="static" color="primary" elevation={4}>
            <Toolbar>
                <Box display="flex" alignItems="center" sx={{ flexGrow: 1, gap: 1.5 }}>
                    <Box
                        component="img"
                        src="/logo.png"
                        alt="DMV logo"
                        sx={{ height: 32, width: 'auto', display: 'block' }}
                    />
                    <div className="app-title">Department of Motor Vehicles Portal</div>
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

    )
}

// Made with Bob
