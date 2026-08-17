import { User } from "oidc-client-ts";
import React, { createContext, useContext, useState, useEffect } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  tokenExchangeCompleted: boolean;
}

export interface AuthContextProps {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  tokenExchangeCompleted: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loginCallback: () => Promise<User | null>;
  loginWithPasskey: () => Promise<User | null>;
  registerPasskey: (nickname?: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextProps | undefined>(undefined);
AuthContext.displayName = "AuthContext";

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

export const AuthProvider = ({ children }: AuthProviderProps): React.ReactNode => {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    tokenExchangeCompleted: false
  });
  
  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Reset authentication state on page load/refresh
        // This is intentional for this demo app to ensure a fresh authentication flow each time
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          tokenExchangeCompleted: false
        });
      } catch (error) {
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          tokenExchangeCompleted: false
        });
      }
    };
    
    checkAuth();
  }, []);
  
  const login = async () => {
    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        tokenExchangeCompleted: false
      }));
      
      // Get authorization URL from server
      const response = await fetch('/auth/login');
      const data = await response.json();
      
      if (!data.authUrl) {
        throw new Error('Failed to get authorization URL');
      }
      
      // Store state and nonce in session storage for verification later
      sessionStorage.setItem('auth_state', data.state);
      sessionStorage.setItem('auth_nonce', data.nonce);
      
      // Redirect to authorization URL
      window.location.href = data.authUrl;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false
      }));
      throw error;
    }
  };
  
  const logout = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // Logout based on session cookie state
      // Call server-side logout endpoint
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

      // No provider logout URL means we can only finish local logout.
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        tokenExchangeCompleted: false
      });
      window.location.replace('/login');
      
    } catch (error: any) {
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
  
  const loginCallback = async (): Promise<User | null> => {
    // Set loading state
    setState(prev => ({
      ...prev,
      isLoading: true,
      tokenExchangeCompleted: false
    }));
    
    try {
      // Get code and state from URL
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      
      // Check if we have the required parameters
      if (!code || !state) {
        throw new Error('Missing authentication parameters');
      }
      
      // Exchange code for tokens using server endpoint
      const response = await fetch('/auth/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code, state })
      });
      
      if (!response.ok) {
        throw new Error('Failed to exchange code for tokens');
      }
      
      const data = await response.json();
      
      // Create a User object from the response
      const user = new User({
        access_token: "dummy",
        token_type: "Bearer",
        scope: "openid",
        profile: data.userInfo,
      });
      
      // Update state based on user authentication result
      setState({
        isLoading: false,
        isAuthenticated: true,
        user: user,
        tokenExchangeCompleted: true
      });
      
      return user;
    } catch (error: any) {
      // Reset authentication state on error
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        tokenExchangeCompleted: false
      });
      
      return null;
    }
  };
  
  const loginWithPasskey = async (): Promise<User | null> => {
    setState(prev => ({ ...prev, isLoading: true, tokenExchangeCompleted: false }));
    try {
      const optionsRes = await fetch('/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!optionsRes.ok) throw new Error('Failed to get passkey authentication options');
      const options = await optionsRes.json();

      const credential = await startAuthentication({ optionsJSON: options });

      const completeRes = await fetch('/auth/passkey/login/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      if (!completeRes.ok) throw new Error('Passkey authentication failed');
      const data = await completeRes.json();

      const user = new User({
        access_token: 'dummy',
        token_type: 'Bearer',
        scope: 'openid',
        profile: data.userInfo
      });

      setState({ isLoading: false, isAuthenticated: true, user, tokenExchangeCompleted: true });
      return user;
    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw err;
    }
  };

  const registerPasskey = async (nickname?: string): Promise<void> => {
    const optionsRes = await fetch('/auth/passkey/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!optionsRes.ok) throw new Error('Failed to get passkey registration options');
    const options = await optionsRes.json();

    const credential = await startRegistration({ optionsJSON: options });

    const completeRes = await fetch('/auth/passkey/register/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, nickname: nickname || 'My Passkey' })
    });
    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}));
      throw new Error(err.details || 'Failed to register passkey');
    }
  };

  const contextValue = React.useMemo(() => ({
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    tokenExchangeCompleted: state.tokenExchangeCompleted,
    login,
    logout,
    loginCallback,
    loginWithPasskey,
    registerPasskey
  }), [state.isLoading, state.isAuthenticated, state.user, state.tokenExchangeCompleted]);
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}


// Made with Bob
