import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Target, MessageSquare, Users, Settings, ArrowLeft } from 'lucide-react';
import ProspectingPage from './ProspectingPage';
import CRMPage from './CRMPage';

type SidebarTab = 'crm' | 'prospecting' | 'comments' | 'requests' | 'config';

interface SidebarItem {
    id: SidebarTab;
    Icon: React.ElementType;
    label: string;
    disabled?: boolean;
}

const sidebarItems: SidebarItem[] = [
    { id: 'crm', Icon: BarChart3, label: 'CRM' },
    { id: 'prospecting', Icon: Target, label: 'Prospecting' },
    { id: 'comments', Icon: MessageSquare, label: 'Comentarios', disabled: true },
    { id: 'requests', Icon: Users, label: 'Solicitudes', disabled: true },
    { id: 'config', Icon: Settings, label: 'Configuración', disabled: true },
];

export default function LinkedInApp() {
    const [activeTab, setActiveTab] = useState<SidebarTab>('crm');
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8f7ff 0%, #f0ecff 50%, #ede9fe 100%)' }}>
            {/* ── Sidebar ───────────────────────────────── */}
            <aside
                className="flex flex-col items-center justify-between py-6 shrink-0"
                style={{
                    width: 60,
                    background: 'linear-gradient(180deg, #1a0533 0%, #2d1054 100%)',
                }}
            >
                <div className="flex flex-col items-center gap-2">
                    {/* Logo */}
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 cursor-pointer"
                        style={{
                            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
                        }}
                        title="LinkedIn Automation"
                    >
                        <span className="text-white text-lg font-bold">in</span>
                    </div>

                    {/* Nav Items */}
                    {sidebarItems.map((item) => (
                        <SidebarButton
                            key={item.id}
                            Icon={item.Icon}
                            label={item.label}
                            active={activeTab === item.id}
                            disabled={item.disabled}
                            onClick={() => !item.disabled && setActiveTab(item.id)}
                        />
                    ))}
                </div>

                {/* Bottom: Back button */}
                <div className="flex flex-col items-center gap-2">
                    <SidebarButton
                        Icon={ArrowLeft}
                        label="Volver"
                        active={false}
                        onClick={() => navigate('/')}
                    />
                </div>
            </aside>

            {/* ── Main Content ──────────────────────────── */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{
                        background: 'rgba(255,255,255,0.7)',
                        backdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(124, 58, 237, 0.1)',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <h1
                            className="text-xl font-bold"
                            style={{
                                background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            LinkedIn Automation
                        </h1>
                        <span className="text-xs px-2 py-1 rounded-full font-medium"
                            style={{
                                background: 'rgba(124, 58, 237, 0.1)',
                                color: '#7c3aed',
                            }}
                        >
                            {activeTab === 'crm' ? 'CRM Pipeline' :
                                activeTab === 'prospecting' ? 'Prospecting' :
                                    activeTab === 'comments' ? 'Comentarios' :
                                        activeTab === 'requests' ? 'Solicitudes' : 'Config'}
                        </span>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'crm' && <CRMPage />}
                    {activeTab === 'prospecting' && <ProspectingPage />}
                    {activeTab === 'config' && (
                        <div className="text-center py-20 text-slate-400 flex flex-col items-center gap-3">
                            <Settings size={48} opacity={0.5} />
                            <span>Configuración — Próximamente</span>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// ── Sidebar Button Component ────────────────────────────────

function SidebarButton({
    Icon,
    label,
    active,
    disabled,
    onClick,
}: {
    Icon: React.ElementType;
    label: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    const [hovered, setHovered] = useState(false);

    return (
        <div className="relative group">
            <button
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                disabled={disabled}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200"
                style={{
                    opacity: disabled ? 0.3 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: active
                        ? 'rgba(124, 58, 237, 0.3)'
                        : hovered && !disabled
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'transparent',
                    transform: hovered && !disabled ? 'scale(1.1)' : 'scale(1)',
                    boxShadow: active ? '0 0 15px rgba(168, 85, 247, 0.3)' : 'none',
                }}
            >
                {/* Active indicator bar */}
                {active && (
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{
                            background: 'linear-gradient(180deg, #a855f7, #7c3aed)',
                            boxShadow: '0 0 8px rgba(168, 85, 247, 0.6)',
                        }}
                    />
                )}
                <Icon size={20} color={active ? '#e9d5ff' : disabled ? '#6b7280' : '#a78bfa'} />
            </button>

            {/* Tooltip */}
            {hovered && !disabled && (
                <div
                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap z-50"
                    style={{
                        background: 'rgba(26, 5, 51, 0.95)',
                        color: '#e9d5ff',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                        animation: 'slideInLeft 0.15s ease-out',
                    }}
                >
                    {label}
                </div>
            )}
        </div>
    );
}
