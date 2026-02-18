
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import LinkedInApp from './components/linkedin/LinkedInApp.tsx'
import { ToastProvider } from './contexts/ToastContext.tsx'
import { ToastContainer } from './components/ui/ToastContainer.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ToastProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<App />} />
                    <Route path="/linkedin" element={<LinkedInApp />} />
                </Routes>
            </BrowserRouter>
            <ToastContainer />
        </ToastProvider>
    </React.StrictMode>,
)
