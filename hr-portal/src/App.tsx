import React from 'react';
import { Routes, Route } from 'react-router';
import { CssBaseline, ThemeProvider } from '@mui/material';
import theme from './theme';
import { AuthProvider } from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import RedirectToLogin from './components/RedirectToLogin';
import OidcCallback from './components/OidcCallback';
import LoginPage from './pages/LoginPage';
import PortalHomePage from './pages/PortalHomePage';
import LogoutCallback from "./components/LogoutCallback";

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RedirectToLogin />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/portal"
            element={(
              <ProtectedRoute>
                <PortalHomePage />
              </ProtectedRoute>
            )}
          />
          <Route path="/logincallback" element={<OidcCallback />} />
          <Route path="/logoutcallback" element={<LogoutCallback />} />
          <Route path="*" element={<RedirectToLogin />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;