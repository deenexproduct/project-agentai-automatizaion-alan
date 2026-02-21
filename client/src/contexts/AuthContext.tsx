import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/axios';

// Interfaces for Auth State
export interface User {
    _id: string;
    email: string;
    name?: string;
    profilePhotoUrl?: string;
    role?: string;
    createdAt: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    error: string | null;
    requestOTP: (email: string) => Promise<boolean>;
    verifyOTP: (email: string, otp: string) => Promise<boolean>;
    updateProfile: (data: { name?: string; profilePhotoUrl?: string }) => Promise<boolean>;
    logout: () => void;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Initial check for existing token validity
    useEffect(() => {
        const fetchMe = async () => {
            const storedToken = localStorage.getItem('token');

            if (!storedToken) {
                setToken(null);
                setUser(null);
                setIsLoading(false);
                return;
            }

            try {
                // api interceptor already adds Bearer
                const response = await api.get('/auth/me');
                setUser(response.data.user);
                setToken(storedToken);
            } catch (err) {
                console.error('Failed to validate existing token:', err);
                localStorage.removeItem('token');
                setToken(null);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMe();
        // Only run on mount - token changes are handled by login/logout
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const requestOTP = async (email: string): Promise<boolean> => {
        setIsLoading(true);
        setError(null);
        try {
            await api.post('/auth/request-otp', { email });
            return true;
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to request OTP. Please try again.');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOTP = async (email: string, otp: string): Promise<boolean> => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.post('/auth/verify-otp', { email, otp });
            const { token, user } = response.data;

            // Save token and state
            localStorage.setItem('token', token);
            setToken(token);
            setUser(user);

            return true;
        } catch (err: any) {
            setError(err.response?.data?.error || 'Invalid OTP. Please try again.');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const updateProfile = async (data: { name?: string; profilePhotoUrl?: string }): Promise<boolean> => {
        try {
            const response = await api.put('/auth/profile', data);
            setUser(response.data.user);
            return true;
        } catch (err) {
            console.error('Failed to update profile:', err);
            return false;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    const clearError = () => setError(null);

    return (
        <AuthContext.Provider value={{ user, token, isLoading, error, requestOTP, verifyOTP, updateProfile, logout, clearError }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
