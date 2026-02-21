import { useState, useEffect, useCallback } from 'react'
import { Calendar, Clock, Mail, Loader2 } from 'lucide-react'
import QRLogin from './QRLogin'
import ScheduleForm from './ScheduleForm'
import ScheduledList from './ScheduledList'
import SentHistory from './SentHistory'

import api from '../../lib/axios';

const API_URL = '/whatsapp';

type SubTab = 'schedule' | 'pending' | 'history'

export default function WhatsAppTab() {
    const [connected, setConnected] = useState(false)
    const [checkingStatus, setCheckingStatus] = useState(true)
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('schedule')

    useEffect(() => {
        checkConnection()
    }, [])

    const checkConnection = async () => {
        try {
            const res = await api.get(`${API_URL}/status`)
            const data = res.data
            setConnected(data.status === 'connected')
        } catch {
            setConnected(false)
        } finally {
            setCheckingStatus(false)
        }
    }

    // Also keep checking while on this tab
    useEffect(() => {
        if (!connected) return
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`${API_URL}/status`)
                const data = res.data
                if (data.status !== 'connected') {
                    setConnected(false)
                }
            } catch { }
        }, 15000)
        return () => clearInterval(interval)
    }, [connected])

    const handleConnected = useCallback(() => {
        setConnected(true)
    }, [])

    if (checkingStatus) {
        return (
            <div className="flex justify-center py-20 relative z-10">
                <Loader2 size={32} className="animate-spin text-violet-500 drop-shadow-md" />
            </div>
        )
    }

    if (!connected) {
        return (
            <div className="relative min-h-[500px]">
                {/* Atmospheric Background for Login */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px]">
                    <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-fuchsia-400/20 rounded-full blur-3xl opacity-60 animate-[pulse_8s_ease-in-out_infinite]" />
                    <div className="absolute top-20 -right-20 w-[400px] h-[400px] bg-violet-500/20 rounded-full blur-3xl opacity-50 animate-[pulse_10s_ease-in-out_infinite_reverse]" />
                    <div className="absolute -bottom-40 left-1/4 w-[600px] h-[600px] bg-cyan-400/10 rounded-full blur-3xl opacity-50 animate-[pulse_12s_ease-in-out_infinite]" />
                </div>
                <QRLogin onConnected={handleConnected} />
            </div>
        )
    }

    return (
        <div className="relative min-h-[600px] p-2 sm:p-4">
            {/* Atmospheric Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px] z-0">
                <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-fuchsia-400/20 rounded-full blur-3xl opacity-50 animate-[pulse_8s_ease-in-out_infinite]" />
                <div className="absolute top-20 -right-20 w-[400px] h-[400px] bg-violet-500/20 rounded-full blur-3xl opacity-40 animate-[pulse_10s_ease-in-out_infinite_reverse]" />
                <div className="absolute -bottom-40 left-1/4 w-[600px] h-[600px] bg-cyan-400/10 rounded-full blur-3xl opacity-40 animate-[pulse_12s_ease-in-out_infinite]" />
            </div>

            <div className="relative z-10">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-white/40 p-5 rounded-[24px] border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)] backdrop-blur-xl">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[16px] bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-[0_8px_20px_rgba(34,197,94,0.3)]">
                            <span className="text-2xl text-white">📱</span>
                        </div>
                        <div>
                            <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">WhatsApp Web</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
                                <span className="text-[12px] font-bold text-green-600 uppercase tracking-widest">Conectado</span>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Pills */}
                    <div className="flex gap-2 bg-white/50 p-1.5 rounded-[20px] border border-white/60 shadow-inner overflow-x-auto hide-scrollbar">
                        {[
                            { id: 'schedule' as SubTab, Icon: Calendar, label: 'Programar' },
                            { id: 'pending' as SubTab, Icon: Clock, label: 'Pendientes' },
                            { id: 'history' as SubTab, Icon: Mail, label: 'Enviados' },
                        ].map(({ id, Icon, label }) => (
                            <button
                                key={id}
                                onClick={() => setActiveSubTab(id)}
                                className={`flex items-center justify-center gap-2 py-2.5 px-5 rounded-[16px] text-[13px] font-bold transition-all duration-300 whitespace-nowrap ${activeSubTab === id
                                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_4px_16px_rgba(139,92,246,0.3)]'
                                        : 'text-slate-600 hover:bg-white/60 hover:text-violet-600'
                                    }`}
                            >
                                <Icon size={16} className={activeSubTab === id ? 'text-white' : 'text-slate-500'} />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sub-tab Content Wrapper */}
                <div className="animate-[fadeInSlideDown_0.4s_ease-out]">
                    {activeSubTab === 'schedule' && <ScheduleForm />}
                    {activeSubTab === 'pending' && <ScheduledList />}
                    {activeSubTab === 'history' && <SentHistory />}
                </div>
            </div>

            <style>{`
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    )
}
