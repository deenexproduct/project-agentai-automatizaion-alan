import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
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
                        <Route path="/linkedin/:tab?" element={<ProtectedRoute><LinkedInApp /></ProtectedRoute>} />
                        <Route path="/:tab?" element={<ProtectedRoute><App /></ProtectedRoute>} />
                    </Routes>
                </BrowserRouter>
                <ToastContainer />
            </ToastProvider>
        </AuthProvider>
    </React.StrictMode>,
)
