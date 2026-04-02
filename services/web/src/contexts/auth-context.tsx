'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, logout as apiLogout, type User } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function hasToken() {
  return typeof window !== 'undefined' && !!localStorage.getItem('token');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [manualUser, setManualUser] = useState<User | null>(null);

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      try {
        const response = await getCurrentUser();
        return response.user;
      } catch {
        localStorage.removeItem('token');
        return null;
      }
    },
    enabled: hasToken() && !manualUser,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  const user = manualUser ?? data ?? null;
  const isLoading = !manualUser && hasToken() && queryLoading;

  const login = useCallback((token: string, userData: User) => {
    localStorage.setItem('token', token);
    setManualUser(userData);
    queryClient.setQueryData(['auth-user'], userData);
  }, [queryClient]);

  const logout = useCallback(() => {
    apiLogout();
    setManualUser(null);
    queryClient.setQueryData(['auth-user'], null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await getCurrentUser();
      setManualUser(response.user);
      queryClient.setQueryData(['auth-user'], response.user);
    } catch (err) {
      // Only logout on 401 (token expired/invalid), not on transient errors
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
    }
  }, [logout, queryClient]);

  const updateUser = useCallback((userData: User) => {
    setManualUser(userData);
    queryClient.setQueryData(['auth-user'], userData);
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
