import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, KeyRound, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

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
        <div className="min-h-screen relative flex flex-col justify-center py-12 sm:px-6 lg:px-8 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-violet-50">
            {/* Background Effects — light mode */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-violet-200/40 rounded-full filter blur-[120px] animate-pulse" />
                <div className="absolute top-40 -right-40 w-[500px] h-[500px] bg-indigo-200/40 rounded-full filter blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute -bottom-40 left-1/2 w-[400px] h-[400px] bg-fuchsia-200/30 rounded-full filter blur-[140px] animate-pulse" style={{ animationDelay: '4s' }} />
            </div>

            <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center mb-6">
                    {/* Brand Logo Container */}
                    <div className="relative group">
                        <div className="absolute -inset-1.5 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                        <div className="relative w-20 h-20 bg-gradient-to-tr from-violet-600 to-indigo-500 backdrop-blur-xl border border-violet-500/30 rounded-3xl shadow-xl shadow-violet-500/20 flex items-center justify-center transform group-hover:scale-105 transition-all duration-300">
                            <img src="/isotipo.png" alt="Deenex Logo" className="w-12 h-12 object-contain" />
                        </div>
                    </div>
                </div>

                <h2 className="mt-2 text-center text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 drop-shadow-sm">
                    {step === 'email' ? 'Deenex Comercial' : 'Verifica tu identidad'}
                </h2>
                <p className="mt-3 text-center text-base text-slate-500 max-w-sm mx-auto">
                    {step === 'email'
                        ? 'Accede de forma segura con tu correo electrónico. No necesitas contraseña.'
                        : `Hemos enviado un código mágico a ${email}`}
                </p>
            </div>

            <div className="relative z-10 mt-10 sm:mx-auto sm:w-full sm:max-w-[420px]">
                {/* Main Card */}
                <div className="relative bg-white/80 backdrop-blur-2xl py-10 px-6 sm:px-12 shadow-xl shadow-slate-200/50 sm:rounded-[2rem] border border-slate-200/60 overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-violet-500/10">

                    {/* Inner glowing top border */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent"></div>

                    {error && (
                        <div className="mb-8 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-600 font-medium leading-relaxed">{error}</p>
                        </div>
                    )}

                    {step === 'email' ? (
                        <form className="space-y-7" onSubmit={handleRequestOTP}>
                            <div className="group">
                                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2 transition-colors group-focus-within:text-violet-600">
                                    Correo Electrónico
                                </label>
                                <div className="relative rounded-2xl transition-all duration-300 group-focus-within:shadow-[0_0_20px_-5px_rgba(139,92,246,0.2)] group-focus-within:-translate-y-0.5">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-400 transition-colors group-focus-within:text-violet-500" />
                                    </div>
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 sm:text-sm transition-all duration-300"
                                        placeholder="tu@empresa.com"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !email}
                                className="relative w-full flex justify-center items-center py-4 px-4 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-1 group overflow-hidden"
                            >
                                {/* Shine effect */}
                                <div className="absolute inset-0 -translate-x-full group-hover:animate-[wave_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"></div>

                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <span className="flex items-center gap-2 relative z-10">
                                        Continuar
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                )}
                            </button>
                        </form>
                    ) : (
                        <form className="space-y-7" onSubmit={handleVerifyOTP}>
                            <div className="group">
                                <div className="flex justify-between items-center mb-2">
                                    <label htmlFor="otp" className="block text-sm font-semibold text-slate-700 transition-colors group-focus-within:text-violet-600">
                                        Código de 6 dígitos
                                    </label>
                                    <span className="text-xs text-slate-400 font-mono">
                                        {otp.length}/6
                                    </span>
                                </div>

                                <div className="relative rounded-2xl transition-all duration-300 group-focus-within:shadow-[0_0_20px_-5px_rgba(139,92,246,0.2)] group-focus-within:-translate-y-0.5">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <KeyRound className="h-5 w-5 text-slate-400 transition-colors group-focus-within:text-violet-500" />
                                    </div>
                                    <input
                                        id="otp"
                                        type="text"
                                        required
                                        maxLength={6}
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                        className="block w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 text-center tracking-[0.7em] text-2xl font-mono focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 sm:leading-6 transition-all duration-300"
                                        placeholder="······"
                                        autoComplete="one-time-code"
                                    />
                                </div>
                                <div className="mt-3 text-center">
                                    <p className="text-xs text-slate-400">
                                        Revisa tu bandeja de entrada o spam.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || otp.length < 6}
                                className="relative w-full flex justify-center items-center py-4 px-4 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-1 group overflow-hidden"
                            >
                                <div className="absolute inset-0 -translate-x-full group-hover:animate-[wave_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"></div>
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <span className="relative z-10">Verificar Código</span>
                                )}
                            </button>

                            <div className="text-center pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setStep('email')}
                                    className="text-sm font-medium text-slate-400 hover:text-violet-600 transition-colors hover:underline decoration-violet-300/50 underline-offset-4"
                                >
                                    ¿Necesitas usar otro correo?
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-400">
                        Creado por Deenex Technologies
                    </p>
                </div>
            </div>

            {/* Custom Animation Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes wave {
                    0% { transform: translateX(-100%) skewX(-15deg); }
                    100% { transform: translateX(200%) skewX(-15deg); }
                }
            `}} />
        </div>
    );
}
