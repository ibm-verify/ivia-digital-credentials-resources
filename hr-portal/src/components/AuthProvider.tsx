import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, type UserProfile } from 'oidc-client-ts';

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  tokenExchangeCompleted: boolean;
}

export interface AuthContextProps extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loginCallback: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

const clearAuthStorage = () => {
  sessionStorage.removeItem('auth_state');
  sessionStorage.removeItem('auth_nonce');
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('oidc.'))
    .forEach(key => sessionStorage.removeItem(key));
};

interface AuthProviderProps {
  children: React.ReactNode;
}

function createUser(profile?: UserProfile | null) {
  if (!profile) {
    return null;
  }

  return new User({
    access_token: 'session',
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile,
  });
}

const unauthenticatedState: AuthState = {
  isLoading: false,
  isAuthenticated: false,
  user: null,
  tokenExchangeCompleted: false,
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    tokenExchangeCompleted: false,
  });

  useEffect(() => {
    let cancelled = false;

    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/auth/status', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error('Failed to check session status');
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (data.authenticated) {
          setState({
            isLoading: false,
            isAuthenticated: true,
            user: createUser(data.user as UserProfile | undefined),
            tokenExchangeCompleted: true,
          });
          return;
        }

        setState(unauthenticatedState);
      } catch {
        if (!cancelled) {
          setState(unauthenticatedState);
        }
      }
    };

    checkAuthStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async () => {
    setState((previous) => ({
      ...previous,
      isLoading: true,
      tokenExchangeCompleted: false,
    }));

    try {
      const response = await fetch('/auth/login', {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Failed to start login flow');
      }

      const data = await response.json();

      if (!data.authUrl || !data.state) {
        throw new Error('Login response was missing required parameters');
      }

      sessionStorage.setItem('auth_state', data.state);
      window.location.assign(data.authUrl);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        isLoading: false,
      }));
      throw error;
    }
  };

  const logout = async () => {
    setState((previous) => ({
      ...previous,
      isLoading: true,
    }));

    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const data = response.ok ? await response.json() : {};

      // Clear session storage
      clearAuthStorage();

      if (data.logoutUrl) {
        window.location.replace(data.logoutUrl);
        return;
      }

      window.location.replace('/login');

    }
      catch (error: any) {
      // If logout fails, still ensure we're logged out locally
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        tokenExchangeCompleted: false
      });
      clearAuthStorage();
      window.location.assign('/login');
    }
  };

  const loginCallback = async () => {
    setState((previous) => ({
      ...previous,
      isLoading: true,
      tokenExchangeCompleted: false,
    }));

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const stateParam = urlParams.get('state');
      const expectedState = sessionStorage.getItem('auth_state');

      if (!code || !stateParam) {
        throw new Error('Missing authentication parameters');
      }

      if (expectedState && stateParam !== expectedState) {
        throw new Error('Authentication state did not match the initiated login');
      }

      const response = await fetch('/auth/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ code, state: stateParam }),
      });

      if (!response.ok) {
        throw new Error('Failed to exchange authorization code');
      }

      const data = await response.json();
      const user = createUser(data.userInfo as UserProfile | undefined);

      sessionStorage.removeItem('auth_state');
      setState({
        isLoading: false,
        isAuthenticated: true,
        user,
        tokenExchangeCompleted: true,
      });

      return user;
    } catch {
      sessionStorage.removeItem('auth_state');
      setState(unauthenticatedState);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        loginCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}