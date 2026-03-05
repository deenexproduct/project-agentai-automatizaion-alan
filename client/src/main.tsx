import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LinkedInApp from './components/linkedin/LinkedInApp.tsx'
import OpsApp from './components/ops/OpsApp.tsx'
import { ToastProvider } from './contexts/ToastContext.tsx'
import { ToastContainer } from './components/ui/ToastContainer.tsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx'
import AuthPage from './components/auth/AuthPage.tsx'
import { ProtectedRoute } from './components/auth/ProtectedRoute.tsx'
import './index.css'

// Smart default route based on user platforms
function DefaultRedirect() {
    const { user, isLoading } = useAuth();
    if (isLoading) return null;
    const platforms = user?.platforms || ['comercial'];
    if (platforms.includes('comercial')) return <Navigate to="/linkedin/dashboard" replace />;
    return <Navigate to="/ops/dashboard" replace />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<AuthPage />} />
                        <Route path="/linkedin/:tab?/:id?" element={<ProtectedRoute platform="comercial"><LinkedInApp /></ProtectedRoute>} />
                        <Route path="/ops/:tab?/:id?" element={<ProtectedRoute platform="operaciones"><OpsApp /></ProtectedRoute>} />
                        <Route path="/calendar" element={<Navigate to="/linkedin/calendar" replace />} />
                        <Route path="/" element={<ProtectedRoute><DefaultRedirect /></ProtectedRoute>} />
                        <Route path="*" element={<ProtectedRoute><DefaultRedirect /></ProtectedRoute>} />
                    </Routes>
                </BrowserRouter>
                <ToastContainer />
            </ToastProvider>
        </AuthProvider>
    </React.StrictMode>,
)
