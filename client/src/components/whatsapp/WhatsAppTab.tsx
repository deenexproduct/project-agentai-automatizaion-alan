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
            <div className="flex justify-center py-20">
                <Loader2 size={32} className="animate-spin text-violet-600" />
            </div>
        )
    }

    if (!connected) {
        return <QRLogin onConnected={handleConnected} />
    }

    return (
        <div>
            {/* Connection Status Bar */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-green-600 font-medium">WhatsApp conectado</span>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 mb-6">
                {[
                    { id: 'schedule' as SubTab, Icon: Calendar, label: 'Programar' },
                    { id: 'pending' as SubTab, Icon: Clock, label: 'Pendientes' },
                    { id: 'history' as SubTab, Icon: Mail, label: 'Enviados' },
                ].map(({ id, Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setActiveSubTab(id)}
                        className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${activeSubTab === id
                            ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        <Icon size={16} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Sub-tab Content */}
            {activeSubTab === 'schedule' && <ScheduleForm />}
            {activeSubTab === 'pending' && <ScheduledList />}
            {activeSubTab === 'history' && <SentHistory />}
        </div>
    )
}
