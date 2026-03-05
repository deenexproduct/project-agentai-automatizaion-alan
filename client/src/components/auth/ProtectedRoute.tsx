import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    platform?: 'comercial' | 'operaciones';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, platform }) => {
    const { token, user, isLoading } = useAuth();
    const location = useLocation();

    // Show loading spinner while validating token
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium tracking-wide animate-pulse">Cargando aplicación...</p>
                </div>
            </div>
        );
    }

    // Only redirect after loading is complete and we confirmed no valid token
    if (!token) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Platform access control
    if (platform && user) {
        const userPlatforms = user.platforms || ['comercial'];
        if (!userPlatforms.includes(platform)) {
            // Redirect to the platform they DO have access to
            const defaultRoute = userPlatforms.includes('comercial')
                ? '/linkedin/dashboard'
                : '/ops/dashboard';
            return <Navigate to={defaultRoute} replace />;
        }
    }

    return <>{children}</>;
};
