import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Columns3, CheckSquare, Calendar as CalendarIcon, Menu } from 'lucide-react';

interface MobileBottomNavProps {
    activeTab: string;
    onMoreClick: () => void;
}

const primaryTabs = [
    { id: 'dashboard', Icon: LayoutDashboard, label: 'Inicio' },
    { id: 'pipeline', Icon: Columns3, label: 'Pipeline' },
    { id: 'tasks', Icon: CheckSquare, label: 'Tareas' },
    { id: 'calendar', Icon: CalendarIcon, label: 'Agenda' },
];

export default function MobileBottomNav({ activeTab, onMoreClick }: MobileBottomNavProps) {
    const navigate = useNavigate();
    const isPrimaryActive = primaryTabs.some(t => t.id === activeTab);

    return (
        <>
            {/* Inline styles for animations */}
            <style>{`
                @keyframes navPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                @keyframes navDotAppear {
                    from { transform: translateX(-50%) scaleX(0); opacity: 0; }
                    to { transform: translateX(-50%) scaleX(1); opacity: 1; }
                }
                .mobile-bottom-nav {
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    backdrop-filter: blur(28px) saturate(180%);
                }
            `}</style>

            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-50 mobile-bottom-nav"
                style={{
                    background: 'linear-gradient(180deg, rgba(15, 3, 30, 0.92) 0%, rgba(10, 2, 20, 0.98) 100%)',
                    borderTop: '1px solid rgba(139, 92, 246, 0.12)',
                    boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.25), 0 -1px 0 rgba(139, 92, 246, 0.08)',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                }}
            >
                <div className="flex items-end justify-around px-1 pt-2 pb-2.5">
                    {primaryTabs.map(({ id, Icon, label }) => {
                        const isActive = activeTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => navigate(`/linkedin/${id}`)}
                                className="relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all duration-300"
                                style={{
                                    minWidth: 64,
                                    WebkitTapHighlightColor: 'transparent',
                                }}
                            >
                                {/* Active background pill */}
                                <div
                                    className="absolute inset-x-2 inset-y-0 rounded-2xl transition-all duration-300"
                                    style={{
                                        background: isActive
                                            ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.18) 0%, rgba(168, 85, 247, 0.10) 100%)'
                                            : 'transparent',
                                        opacity: isActive ? 1 : 0,
                                        transform: isActive ? 'scale(1)' : 'scale(0.8)',
                                    }}
                                />

                                {/* Icon container */}
                                <div
                                    className="relative z-10 flex items-center justify-center w-7 h-7 transition-all duration-300"
                                    style={{
                                        animation: isActive ? 'navPulse 2s ease-in-out infinite' : 'none',
                                    }}
                                >
                                    <Icon
                                        size={isActive ? 23 : 21}
                                        strokeWidth={isActive ? 2.2 : 1.8}
                                        style={{
                                            color: isActive ? '#c4b5fd' : 'rgba(148, 130, 180, 0.5)',
                                            filter: isActive ? 'drop-shadow(0 0 8px rgba(167, 139, 250, 0.4))' : 'none',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        }}
                                    />
                                </div>

                                {/* Label */}
                                <span
                                    className="relative z-10 transition-all duration-300"
                                    style={{
                                        fontSize: isActive ? 10.5 : 10,
                                        fontWeight: isActive ? 700 : 500,
                                        color: isActive ? '#c4b5fd' : 'rgba(148, 130, 180, 0.45)',
                                        letterSpacing: isActive ? '0.02em' : '0',
                                        textShadow: isActive ? '0 0 12px rgba(167, 139, 250, 0.3)' : 'none',
                                    }}
                                >
                                    {label}
                                </span>

                                {/* Active indicator line */}
                                {isActive && (
                                    <div
                                        className="absolute -top-[1px] left-1/2"
                                        style={{
                                            width: 20,
                                            height: 3,
                                            borderRadius: '0 0 4px 4px',
                                            background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #8b5cf6)',
                                            boxShadow: '0 2px 12px rgba(139, 92, 246, 0.5), 0 0px 20px rgba(139, 92, 246, 0.2)',
                                            animation: 'navDotAppear 0.3s ease-out forwards',
                                        }}
                                    />
                                )}
                            </button>
                        );
                    })}

                    {/* More Button — distinct visual treatment */}
                    <button
                        onClick={onMoreClick}
                        className="relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all duration-300"
                        style={{
                            minWidth: 64,
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        {/* Active state (when a non-primary tab is selected) */}
                        <div
                            className="absolute inset-x-2 inset-y-0 rounded-2xl transition-all duration-300"
                            style={{
                                background: !isPrimaryActive
                                    ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.18) 0%, rgba(168, 85, 247, 0.10) 100%)'
                                    : 'transparent',
                                opacity: !isPrimaryActive ? 1 : 0,
                                transform: !isPrimaryActive ? 'scale(1)' : 'scale(0.8)',
                            }}
                        />

                        <div
                            className="relative z-10 flex items-center justify-center w-7 h-7 transition-all duration-300"
                            style={{
                                animation: !isPrimaryActive ? 'navPulse 2s ease-in-out infinite' : 'none',
                            }}
                        >
                            <div
                                className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300"
                                style={{
                                    background: !isPrimaryActive
                                        ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(168, 85, 247, 0.15))'
                                        : 'rgba(148, 130, 180, 0.08)',
                                    border: !isPrimaryActive
                                        ? '1px solid rgba(167, 139, 250, 0.25)'
                                        : '1px solid rgba(148, 130, 180, 0.1)',
                                }}
                            >
                                <Menu
                                    size={!isPrimaryActive ? 16 : 15}
                                    strokeWidth={!isPrimaryActive ? 2.2 : 1.8}
                                    style={{
                                        color: !isPrimaryActive ? '#c4b5fd' : 'rgba(148, 130, 180, 0.5)',
                                        filter: !isPrimaryActive ? 'drop-shadow(0 0 8px rgba(167, 139, 250, 0.4))' : 'none',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    }}
                                />
                            </div>
                        </div>

                        <span
                            className="relative z-10 transition-all duration-300"
                            style={{
                                fontSize: !isPrimaryActive ? 10.5 : 10,
                                fontWeight: !isPrimaryActive ? 700 : 500,
                                color: !isPrimaryActive ? '#c4b5fd' : 'rgba(148, 130, 180, 0.45)',
                                letterSpacing: !isPrimaryActive ? '0.02em' : '0',
                                textShadow: !isPrimaryActive ? '0 0 12px rgba(167, 139, 250, 0.3)' : 'none',
                            }}
                        >
                            Más
                        </span>

                        {!isPrimaryActive && (
                            <div
                                className="absolute -top-[1px] left-1/2"
                                style={{
                                    width: 20,
                                    height: 3,
                                    borderRadius: '0 0 4px 4px',
                                    background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #8b5cf6)',
                                    boxShadow: '0 2px 12px rgba(139, 92, 246, 0.5), 0 0px 20px rgba(139, 92, 246, 0.2)',
                                    animation: 'navDotAppear 0.3s ease-out forwards',
                                }}
                            />
                        )}
                    </button>
                </div>
            </nav>
        </>
    );
}
