import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// El CRM entero se carga aparte. Antes iba todo en un bundle único de ~1,6 MB
// y el portal del partner —una página pública que se abre desde WhatsApp, en el
// teléfono— se bajaba la aplicación completa para mostrar unas pocas tarjetas.
const LinkedInApp = lazy(() => import('./components/linkedin/LinkedInApp.tsx'))
const OpsApp = lazy(() => import('./components/ops/OpsApp.tsx'))
const PublicReport = lazy(() => import('./components/ops/PublicReport.tsx'))
import { ToastProvider } from './contexts/ToastContext.tsx'
import { ToastContainer } from './components/ui/ToastContainer.tsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx'
import AuthPage from './components/auth/AuthPage.tsx'
import PortalPartner from './components/public/PortalPartner.tsx'
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
                    <Suspense fallback={null}>
                    <Routes>
                        <Route path="/login" element={<AuthPage />} />
                        <Route path="/public/report/:token" element={<PublicReport />} />
                        <Route path="/partners/:token" element={<PortalPartner />} />
                        <Route path="/linkedin/:tab?/:id?" element={<ProtectedRoute platform="comercial"><LinkedInApp /></ProtectedRoute>} />
                        <Route path="/ops/:tab?/:id?" element={<ProtectedRoute platform="operaciones"><OpsApp /></ProtectedRoute>} />
                        <Route path="/calendar" element={<Navigate to="/linkedin/calendar" replace />} />
                        <Route path="/" element={<ProtectedRoute><DefaultRedirect /></ProtectedRoute>} />
                        <Route path="*" element={<ProtectedRoute><DefaultRedirect /></ProtectedRoute>} />
                    </Routes>
                    </Suspense>
                </BrowserRouter>
                <ToastContainer />
            </ToastProvider>
        </AuthProvider>
    </React.StrictMode>,
)
