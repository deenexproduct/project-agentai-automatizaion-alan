import { useNavigate } from 'react-router-dom';
import {
    Building2, User, Handshake, Target, Sparkles, MessageSquare, Users,
    MessageCircle, Mic, Puzzle, Settings, X, ChevronRight
} from 'lucide-react';

interface MobileMorePageProps {
    activeTab: string;
    onClose: () => void;
    /** Manos de partners esperando respuesta. Se muestra sobre Marcas Buscadas. */
    pendientes?: number;
}

interface MoreItem {
    id: string;
    Icon: React.ElementType;
    label: string;
    accentColor: string;
    accentBg: string;
    disabled?: boolean;
}

const sections: { title: string; items: MoreItem[] }[] = [
    {
        title: 'CRM',
        items: [
            // Faltaba: en el celular esta pantalla no tenía ninguna puerta de
            // entrada, solo se llegaba tipeando la URL. Va primera porque es la
            // única del grupo donde alguien puede estar esperando respuesta.
            { id: 'marcas-buscadas', Icon: Target, label: 'Marcas Buscadas', accentColor: '#7c3aed', accentBg: 'rgba(124, 58, 237, 0.1)' },
            { id: 'companies', Icon: Building2, label: 'Empresas', accentColor: '#7c3aed', accentBg: 'rgba(124, 58, 237, 0.1)' },
            { id: 'contacts', Icon: User, label: 'Contactos', accentColor: '#7c3aed', accentBg: 'rgba(124, 58, 237, 0.1)' },
            { id: 'partners', Icon: Handshake, label: 'Partners Oficiales', accentColor: '#7c3aed', accentBg: 'rgba(124, 58, 237, 0.1)' },
        ],
    },
    {
        title: 'LinkedIn',
        items: [
            // Prospecting CRM, Prospecting Bots y Publicaciones AI quedan ocultas
            // del menú (igual que en el sidebar de escritorio). Las pantallas siguen
            // existiendo y se puede entrar por URL.
            { id: 'comments', Icon: MessageSquare, label: 'Comentarios', accentColor: '#3b82f6', accentBg: 'rgba(59, 130, 246, 0.1)', disabled: true },
            { id: 'requests', Icon: Users, label: 'Solicitudes', accentColor: '#3b82f6', accentBg: 'rgba(59, 130, 246, 0.1)', disabled: true },
        ],
    },
    {
        title: 'Herramientas',
        items: [
            { id: 'whatsapp', Icon: MessageCircle, label: 'WhatsApp', accentColor: '#25D366', accentBg: 'rgba(37, 211, 102, 0.1)' },
            { id: 'voice', Icon: Mic, label: 'Transcriptor de Audio', accentColor: '#f59e0b', accentBg: 'rgba(245, 158, 11, 0.1)' },
            { id: 'extension', Icon: Puzzle, label: 'Extensión Web', accentColor: '#ec4899', accentBg: 'rgba(236, 72, 153, 0.1)' },
        ],
    },
    {
        title: 'Configuración',
        items: [
            { id: 'profile', Icon: User, label: 'Mi Perfil', accentColor: '#7c3aed', accentBg: 'rgba(124, 58, 237, 0.1)' },
            { id: 'team', Icon: Users, label: 'Equipo', accentColor: '#7c3aed', accentBg: 'rgba(124, 58, 237, 0.1)' },
            { id: 'config', Icon: Settings, label: 'Configuración Extensión', accentColor: '#ec4899', accentBg: 'rgba(236, 72, 153, 0.1)' },
        ],
    },
];

export default function MobileMorePage({ activeTab, onClose, pendientes = 0 }: MobileMorePageProps) {
    const navigate = useNavigate();

    const handleNavigate = (id: string) => {
        navigate(`/linkedin/${id}`);
        onClose();
    };

    return (
        <div
            className="md:hidden fixed inset-0 z-[60] flex flex-col mobile-more-page"
            style={{
                background: 'linear-gradient(135deg, #f8f7ff 0%, #f0ecff 50%, #ede9fe 100%)',
                animation: 'mobileMoreSlideUp 0.3s ease-out',
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-5 py-4 shrink-0"
                style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(20px)',
                    borderBottom: '1px solid rgba(124, 58, 237, 0.1)',
                }}
            >
                <h1
                    className="text-lg font-bold"
                    style={{
                        background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}
                >
                    Más opciones
                </h1>
                <button
                    onClick={onClose}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                    style={{
                        background: 'rgba(124, 58, 237, 0.08)',
                    }}
                >
                    <X size={20} style={{ color: '#7c3aed' }} />
                </button>
            </div>

            {/* Content */}
            <div
                className="flex-1 overflow-y-auto px-4 py-4"
                style={{ paddingBottom: 'calc(70px + env(safe-area-inset-bottom, 0px))' }}
            >
                {sections.map(section => (
                    <div key={section.title} className="mb-5">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                            {section.title}
                        </h2>
                        <div
                            className="rounded-2xl overflow-hidden border border-white/80"
                            style={{
                                background: 'rgba(255, 255, 255, 0.7)',
                                backdropFilter: 'blur(12px)',
                                boxShadow: '0 4px 20px rgba(30, 27, 75, 0.04)',
                            }}
                        >
                            {section.items.map((item, idx) => {
                                const isActive = activeTab === item.id;
                                const isLast = idx === section.items.length - 1;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => !item.disabled && handleNavigate(item.id)}
                                        disabled={item.disabled}
                                        className="flex items-center gap-3 w-full px-4 py-3.5 transition-all duration-150 active:bg-slate-50"
                                        style={{
                                            opacity: item.disabled ? 0.4 : 1,
                                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                                            borderBottom: !isLast ? '1px solid rgba(0,0,0,0.04)' : 'none',
                                            background: isActive ? 'rgba(124, 58, 237, 0.06)' : 'transparent',
                                        }}
                                    >
                                        <div
                                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                            style={{
                                                background: isActive ? `${item.accentColor}22` : item.accentBg,
                                            }}
                                        >
                                            <item.Icon
                                                size={18}
                                                style={{
                                                    color: item.accentColor,
                                                }}
                                            />
                                        </div>
                                        <span
                                            className="text-[14px] font-semibold flex-1 text-left"
                                            style={{
                                                color: isActive ? '#7c3aed' : '#334155',
                                            }}
                                        >
                                            {item.label}
                                        </span>
                                        {item.id === 'marcas-buscadas' && pendientes > 0 && (
                                            <span
                                                className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                                                style={{ background: '#f43f5e', color: '#fff' }}
                                            >
                                                {pendientes}
                                            </span>
                                        )}
                                        {item.disabled && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-400">
                                                Pronto
                                            </span>
                                        )}
                                        {!item.disabled && (
                                            <ChevronRight size={16} style={{ color: isActive ? '#7c3aed' : '#cbd5e1' }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
