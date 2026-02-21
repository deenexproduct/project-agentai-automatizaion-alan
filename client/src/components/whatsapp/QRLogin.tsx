import { useState, useEffect } from 'react'

import api from '../../lib/axios';

const API_URL = '/whatsapp';

interface Props {
    onConnected: () => void
}

export default function QRLogin({ onConnected }: Props) {
    const [qr, setQr] = useState<string | null>(null)
    const [status, setStatus] = useState('disconnected')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await api.get(`${API_URL}/status`)
                const data = res.data
                setStatus(data.status)

                if (data.status === 'connected') {
                    onConnected()
                    return
                }

                if (data.qr) {
                    setQr(data.qr)
                }
            } catch {
                setStatus('disconnected')
            } finally {
                setLoading(false)
            }
        }

        checkStatus()
        const interval = setInterval(checkStatus, 2500)
        return () => clearInterval(interval)
    }, [onConnected])

    const handleReset = async () => {
        try {
            setLoading(true)
            await api.post(`${API_URL}/reset`)
            setStatus('disconnected')
            setQr(null)
        } catch (error) {
            console.error('Error reseteando sesión:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 relative z-10">
                <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                    style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(217,70,239,0.2))', boxShadow: '0 0 20px rgba(139,92,246,0.3)' }}>
                    <span className="text-3xl">📱</span>
                </div>
                <p className="mt-4 text-slate-500 font-medium tracking-wide">Conectando con WhatsApp...</p>
            </div>
        )
    }

    if (status === 'connecting') {
        return (
            <div className="flex flex-col items-center justify-center py-20 relative z-10">
                <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                    style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.2))', boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
                    <span className="text-3xl">🔐</span>
                </div>
                <p className="mt-4 text-slate-700 font-bold text-[16px]">Autenticando...</p>
                <p className="mt-1 text-[13px] text-slate-500 mb-6 font-medium tracking-wide">Estableciendo conexión segura</p>

                {/* Reset Button to break out of stuck state */}
                <button
                    onClick={handleReset}
                    className="px-5 py-2.5 text-[13px] font-bold text-red-500 transition-all duration-300 rounded-[12px] hover:-translate-y-0.5"
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)',
                    }}
                >
                    Cancelar / Desvincular Cuenta
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center py-12 relative z-10">
            <div
                className="rounded-[24px] p-8 max-w-sm w-full transition-all duration-300 animate-[fadeInSlideDown_0.5s_ease]"
                style={{
                    background: 'rgba(255, 255, 255, 0.45)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255, 255, 255, 0.8)',
                    boxShadow: '0 8px 32px rgba(30, 27, 75, 0.05)',
                }}
            >
                <div className="text-center mb-6">
                    <div className="w-14 h-14 rounded-[16px] flex items-center justify-center mx-auto mb-4"
                        style={{
                            background: 'linear-gradient(135deg, #22c55e, #10b981)',
                            boxShadow: '0 8px 24px -6px rgba(34,197,94,0.5)',
                        }}>
                        <span className="text-2xl text-white">📱</span>
                    </div>
                    <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">Conectar WhatsApp</h2>
                    <p className="text-[13px] text-slate-500 mt-1 font-medium">Escaneá el código QR con tu teléfono</p>
                </div>

                {qr ? (
                    <div className="flex flex-col items-center">
                        <div
                            className="p-4 rounded-[20px] transition-transform duration-300 hover:-translate-y-1"
                            style={{
                                background: 'white',
                                border: '1px solid rgba(255,255,255,0.9)',
                                boxShadow: '0 12px 32px rgba(0,0,0,0.08)',
                            }}
                        >
                            <img src={qr} alt="WhatsApp QR Code" className="w-[200px] h-[200px]" />
                        </div>
                        <div className="mt-8 space-y-3 text-[13px] text-slate-600 text-left font-medium">
                            <p className="flex items-start gap-3">
                                <span className="text-[16px] leading-5 drop-shadow-sm">1️⃣</span>
                                <span>Abrí WhatsApp en tu celular</span>
                            </p>
                            <p className="flex items-start gap-3">
                                <span className="text-[16px] leading-5 drop-shadow-sm">2️⃣</span>
                                <span>Tocá <strong>Dispositivos vinculados</strong></span>
                            </p>
                            <p className="flex items-start gap-3">
                                <span className="text-[16px] leading-5 drop-shadow-sm">3️⃣</span>
                                <span>Escaneá este código QR</span>
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center py-8">
                        <div
                            className="w-[200px] h-[200px] rounded-[20px] flex items-center justify-center relative overflow-hidden"
                            style={{
                                background: 'rgba(255,255,255,0.3)',
                                border: '2px dashed rgba(139,92,246,0.3)',
                            }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/5 to-fuchsia-500/5" />
                            <div className="text-center relative z-10">
                                <div className="animate-spin w-8 h-8 rounded-full mx-auto mb-3"
                                    style={{
                                        border: '3px solid rgba(139,92,246,0.2)',
                                        borderTopColor: '#8b5cf6',
                                    }}></div>
                                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Generando QR</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeInSlideDown {
                    from { opacity: 0; transform: translateY(-12px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    )
}
