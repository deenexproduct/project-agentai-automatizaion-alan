import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, KeyRound, ArrowRight, Loader2, Sparkles, AlertCircle } from 'lucide-react';

export default function AuthPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { requestOTP, verifyOTP, token, error, isLoading, clearError } = useAuth();

    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');

    const from = location.state?.from?.pathname || '/linkedin/dashboard';

    // Redirect if already logged in (only after auth check is complete)
    useEffect(() => {
        // Only redirect if we have a token AND auth check is complete
        // This prevents redirect loop when token is being validated/removed
        if (token && !isLoading) {
            navigate(from, { replace: true });
        }
    }, [token, isLoading, navigate, from]);

    // Handle initial Email request
    const handleRequestOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        if (!email.trim()) return;

        const success = await requestOTP(email);
        if (success) {
            setStep('otp');
        }
    };

    // Handle OTP verification
    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        if (!otp.trim() || otp.length < 6) return;

        const success = await verifyOTP(email, otp);
        if (success) {
            navigate(from, { replace: true });
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-2xl shadow-xl flex items-center justify-center transform rotate-3 hover:rotate-6 transition-transform">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
                    {step === 'email' ? 'Bienvenido a VoiceCommand' : 'Verifica tu identidad'}
                </h2>
                <p className="mt-2 text-center text-sm text-slate-500">
                    {step === 'email'
                        ? 'Ingresa tu email para recibir un código de acceso sin contraseñas.'
                        : `Código enviado a ${email}`}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white/80 backdrop-blur-xl py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10 border border-white/50 ring-1 ring-slate-100">
                    {error && (
                        <div className="mb-6 bg-red-50/80 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-600 font-medium leading-relaxed">{error}</p>
                        </div>
                    )}

                    {step === 'email' ? (
                        <form className="space-y-6" onSubmit={handleRequestOTP}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                                    Correo Electrónico
                                </label>
                                <div className="mt-2 relative rounded-xl shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full pl-11 pr-4 py-3 border-0 ring-1 ring-inset ring-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-2 focus:ring-inset focus:ring-violet-600 sm:text-sm sm:leading-6 transition-all"
                                        placeholder="alannaimtapia@example.com"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !email}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <span className="flex items-center gap-2">
                                        Enviar Código
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                )}
                            </button>
                        </form>
                    ) : (
                        <form className="space-y-6" onSubmit={handleVerifyOTP}>
                            <div>
                                <label htmlFor="otp" className="block text-sm font-semibold text-slate-700">
                                    Código de 6 dígitos
                                </label>
                                <div className="mt-2 relative rounded-xl shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <KeyRound className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="otp"
                                        type="text"
                                        required
                                        maxLength={6}
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                        className="block w-full pl-11 pr-4 py-3 border-0 ring-1 ring-inset ring-slate-200 rounded-xl bg-slate-50 text-slate-900 text-center tracking-[0.5em] text-xl font-mono focus:ring-2 focus:ring-inset focus:ring-violet-600 sm:leading-6 transition-all"
                                        placeholder="000000"
                                        autoComplete="one-time-code"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || otp.length < 6}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/30 hover:shadow-xl hover:-translate-y-0.5"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    'Completar Ingreso'
                                )}
                            </button>

                            <div className="text-center pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep('email')}
                                    className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                                >
                                    Volver e intentar con otro email
                                </button>
                            </div>
                        </form>
                    )}
                </div>
                <p className="mt-10 text-center text-xs text-slate-400">
                    Protegido por seguridad Multi-Tenant (RLS)
                </p>
            </div>
        </div>
    );
}
