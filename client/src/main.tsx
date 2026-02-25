import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LinkedInApp from './components/linkedin/LinkedInApp.tsx'
import { ToastProvider } from './contexts/ToastContext.tsx'
import { ToastContainer } from './components/ui/ToastContainer.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import AuthPage from './components/auth/AuthPage.tsx'
import { ProtectedRoute } from './components/auth/ProtectedRoute.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<AuthPage />} />
                        <Route path="/linkedin/:tab?/:id?" element={<ProtectedRoute><LinkedInApp /></ProtectedRoute>} />
                        <Route path="/calendar" element={<Navigate to="/linkedin/calendar" replace />} />
                        <Route path="/" element={<Navigate to="/linkedin/dashboard" replace />} />
                        <Route path="*" element={<Navigate to="/linkedin/dashboard" replace />} />
                    </Routes>
                </BrowserRouter>
                <ToastContainer />
            </ToastProvider>
        </AuthProvider>
    </React.StrictMode>,
)
