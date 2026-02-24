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
            <style>{`
                @keyframes navSlideUp {
                    from { transform: translateY(4px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .mobile-nav-glass {
                    -webkit-backdrop-filter: blur(24px) saturate(180%);
                    backdrop-filter: blur(24px) saturate(180%);
                }
            `}</style>

            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-50 mobile-nav-glass"
                style={{
                    background: 'rgba(255, 255, 255, 0.72)',
                    borderTop: '1px solid rgba(139, 92, 246, 0.08)',
                    boxShadow: '0 -1px 20px rgba(124, 58, 237, 0.06), 0 -1px 0 rgba(0, 0, 0, 0.03)',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                }}
            >
                <div className="flex items-end justify-around px-2 pt-2 pb-2">
                    {primaryTabs.map(({ id, Icon, label }) => {
                        const isActive = activeTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => navigate(`/linkedin/${id}`)}
                                className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-all duration-300"
                                style={{
                                    minWidth: 60,
                                    WebkitTapHighlightColor: 'transparent',
                                }}
                            >
                                {/* Active pill background */}
                                <div
                                    className="absolute inset-x-1.5 inset-y-0 rounded-2xl transition-all duration-300"
                                    style={{
                                        background: isActive
                                            ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.10) 0%, rgba(168, 85, 247, 0.06) 100%)'
                                            : 'transparent',
                                        opacity: isActive ? 1 : 0,
                                        transform: isActive ? 'scale(1)' : 'scale(0.85)',
                                    }}
                                />

                                {/* Icon */}
                                <div className="relative z-10 flex items-center justify-center w-7 h-7 transition-all duration-300">
                                    <Icon
                                        size={isActive ? 22 : 20}
                                        strokeWidth={isActive ? 2.3 : 1.7}
                                        style={{
                                            color: isActive ? '#7c3aed' : '#94a3b8',
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
                                        color: isActive ? '#7c3aed' : '#94a3b8',
                                        letterSpacing: isActive ? '0.01em' : '0',
                                    }}
                                >
                                    {label}
                                </span>

                                {/* Active indicator dot */}
                                {isActive && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: -1,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            width: 16,
                                            height: 3,
                                            borderRadius: '0 0 3px 3px',
                                            background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                                            animation: 'navSlideUp 0.25s ease-out forwards',
                                        }}
                                    />
                                )}
                            </button>
                        );
                    })}

                    {/* More Button */}
                    <button
                        onClick={onMoreClick}
                        className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-all duration-300"
                        style={{
                            minWidth: 60,
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        <div
                            className="absolute inset-x-1.5 inset-y-0 rounded-2xl transition-all duration-300"
                            style={{
                                background: !isPrimaryActive
                                    ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.10) 0%, rgba(168, 85, 247, 0.06) 100%)'
                                    : 'transparent',
                                opacity: !isPrimaryActive ? 1 : 0,
                                transform: !isPrimaryActive ? 'scale(1)' : 'scale(0.85)',
                            }}
                        />

                        <div className="relative z-10 flex items-center justify-center w-7 h-7 transition-all duration-300">
                            <div
                                className="flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-300"
                                style={{
                                    background: !isPrimaryActive
                                        ? 'rgba(124, 58, 237, 0.10)'
                                        : 'rgba(148, 163, 184, 0.08)',
                                    border: !isPrimaryActive
                                        ? '1px solid rgba(139, 92, 246, 0.15)'
                                        : '1px solid rgba(148, 163, 184, 0.12)',
                                }}
                            >
                                <Menu
                                    size={14}
                                    strokeWidth={!isPrimaryActive ? 2.2 : 1.7}
                                    style={{
                                        color: !isPrimaryActive ? '#7c3aed' : '#94a3b8',
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
                                color: !isPrimaryActive ? '#7c3aed' : '#94a3b8',
                                letterSpacing: !isPrimaryActive ? '0.01em' : '0',
                            }}
                        >
                            Más
                        </span>

                        {!isPrimaryActive && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: -1,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 16,
                                    height: 3,
                                    borderRadius: '0 0 3px 3px',
                                    background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                                    animation: 'navSlideUp 0.25s ease-out forwards',
                                }}
                            />
                        )}
                    </button>
                </div>
            </nav>
        </>
    );
}
