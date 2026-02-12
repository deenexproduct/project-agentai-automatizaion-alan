import { useState, useEffect } from 'react'

import { API_BASE } from '../../config';

const API_URL = `${API_BASE}/api/whatsapp`;

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
                const res = await fetch(`${API_URL}/status`)
                const data = await res.json()
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

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center animate-pulse">
                    <span className="text-3xl">📱</span>
                </div>
                <p className="mt-4 text-slate-500">Conectando con WhatsApp...</p>
            </div>
        )
    }

    if (status === 'connecting') {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center animate-pulse">
                    <span className="text-3xl">🔐</span>
                </div>
                <p className="mt-4 text-slate-600 font-medium">Autenticando...</p>
                <p className="mt-1 text-sm text-slate-400">Estableciendo conexión segura</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-sm w-full">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <span className="text-3xl">📱</span>
                    </div>
                    <h2 className="text-xl font-semibold text-slate-800">Conectar WhatsApp</h2>
                    <p className="text-sm text-slate-500 mt-1">Escaneá el código QR con tu teléfono</p>
                </div>

                {qr ? (
                    <div className="flex flex-col items-center">
                        <div className="bg-white p-3 rounded-xl border-2 border-slate-100">
                            <img src={qr} alt="WhatsApp QR Code" className="w-64 h-64" />
                        </div>
                        <div className="mt-6 space-y-2 text-sm text-slate-500 text-left">
                            <p className="flex items-start gap-2">
                                <span className="text-lg leading-5">1️⃣</span>
                                <span>Abrí WhatsApp en tu teléfono</span>
                            </p>
                            <p className="flex items-start gap-2">
                                <span className="text-lg leading-5">2️⃣</span>
                                <span>Tocá <strong>Dispositivos vinculados</strong></span>
                            </p>
                            <p className="flex items-start gap-2">
                                <span className="text-lg leading-5">3️⃣</span>
                                <span>Escaneá este código QR</span>
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center py-8">
                        <div className="w-64 h-64 bg-slate-50 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-200">
                            <div className="text-center">
                                <div className="animate-spin w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full mx-auto mb-3"
                                    style={{ borderWidth: '3px' }}></div>
                                <p className="text-sm text-slate-400">Generando código QR...</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
