import { useState } from 'react';
import MobileBottomNav from '../layout/MobileBottomNav';
import MobileMorePage from '../layout/MobileMorePage';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, Target, MessageSquare, Users, Settings, Sparkles, MessageCircle, Mic, Puzzle, Building2, User, Handshake, Swords, LayoutDashboard, Database, CheckSquare, Columns3, Calendar as CalendarIcon, Monitor, CalendarRange, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PlatformSwitcher from '../common/PlatformSwitcher';
import ProspectingPage from './ProspectingPage';
import CRMDashboard from '../crm/CRMDashboard';
import PipelineBoard from '../crm/PipelineBoard';
import CompanyList from '../crm/CompanyList';
import ContactList from '../crm/ContactList';
import ContactDrawerV2 from './ContactDrawerV2';
import TaskList from '../crm/TaskList';
import PartnerList from '../crm/PartnerList';
import CompetitorList from '../crm/CompetitorList';
import PosSystemList from '../crm/PosSystemList';
import EventFairList from '../crm/EventFairList';
import CRMPage from './CRMPage';
import ConfigPage from './ConfigPage';
import PublicacionesPage from './PublicacionesPage';
import VoiceCommandPage from './VoiceCommandPage';
import WhatsAppPage from './WhatsAppPage';
import ExtensionPage from './ExtensionPage';
import TeamPermissions from '../team/TeamPermissions';
import ProfileSettings from '../settings/ProfileSettings';
import CalendarPage from '../../pages/calendar/index';

type SidebarTab = 'dashboard' | 'pipeline' | 'companies' | 'contacts' | 'tasks' | 'partners' | 'competitors' | 'pos-systems' | 'events' | 'calendar' | 'prospecting-crm' | 'publicaciones' | 'prospecting' | 'comments' | 'requests' | 'config' | 'whatsapp' | 'voice' | 'extension' | 'team' | 'profile';

interface SidebarItem {
    id: SidebarTab;
    Icon: React.ElementType;
    label: string;
    disabled?: boolean;
    accentColor?: string;
}

const crmGroup: SidebarItem[] = [
    { id: 'dashboard', Icon: LayoutDashboard, label: 'Dashboard CRM' },
    { id: 'pipeline', Icon: Columns3, label: 'Pipeline Deals' },
    { id: 'tasks', Icon: CheckSquare, label: 'Tareas y Actividad' },
    { id: 'calendar', Icon: CalendarIcon, label: 'Calendario y Citas' },
    { id: 'companies', Icon: Building2, label: 'Empresas' },
    { id: 'contacts', Icon: User, label: 'Contactos' },
    { id: 'partners', Icon: Handshake, label: 'Partners Oficiales' },
    { id: 'competitors', Icon: Swords, label: 'Competidores' },
    { id: 'pos-systems', Icon: Monitor, label: 'Sistemas POS' },
    { id: 'events', Icon: CalendarRange, label: 'Eventos y Ferias' },
];

const linkedinGroup: SidebarItem[] = [
    { id: 'prospecting-crm', Icon: Target, label: 'Prospecting CRM', accentColor: '#3b82f6' },
    { id: 'prospecting', Icon: Target, label: 'Prospecting Bots', accentColor: '#3b82f6' },
    { id: 'publicaciones', Icon: Sparkles, label: 'Publicaciones AI', accentColor: '#3b82f6' },
    { id: 'comments', Icon: MessageSquare, label: 'Comentarios', disabled: true, accentColor: '#3b82f6' },
    { id: 'requests', Icon: Users, label: 'Solicitudes', disabled: true, accentColor: '#3b82f6' },
];

const whatsappGroup: SidebarItem[] = [
    { id: 'whatsapp', Icon: MessageCircle, label: 'WhatsApp', accentColor: '#25D366' },
];

const audioGroup: SidebarItem[] = [
    { id: 'voice', Icon: Mic, label: 'Transcriptor de Audio', accentColor: '#f59e0b' },
];

const extensionGroup: SidebarItem[] = [
    { id: 'extension', Icon: Puzzle, label: 'Extensión Web', accentColor: '#ec4899' },
];

const bottomGroup: SidebarItem[] = [
    { id: 'profile', Icon: User, label: 'Mi Perfil' },
    { id: 'team', Icon: Users, label: 'Equipo' },
    { id: 'config', Icon: Settings, label: 'Configuración Extensión', accentColor: '#ec4899' },
];

export default function LinkedInApp() {
    const { tab, id } = useParams<{ tab: string; id?: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [showMore, setShowMore] = useState(false);

    const hasBothPlatforms = user?.platforms?.includes('comercial') && user?.platforms?.includes('operaciones');

    // Default to 'dashboard' if no tab or invalid tab is provided
    const activeTab = (tab as SidebarTab) || 'dashboard';

    return (
        <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8f7ff 0%, #f0ecff 50%, #ede9fe 100%)' }}>
            {/* ── Sidebar (Desktop only) ───────────────────────────────── */}
            <aside
                className="hidden md:flex flex-col items-center justify-between py-6 shrink-0"
                style={{
                    width: 60,
                    background: 'linear-gradient(180deg, #1a0533 0%, #2d1054 100%)',
                }}
            >
                <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto w-full custom-scrollbar-sidebar pb-4" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                    <style>{`
                        .custom-scrollbar-sidebar::-webkit-scrollbar { display: none; }
                    `}</style>
                    {/* Logo */}
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 cursor-pointer shrink-0 mt-2"
                        style={{
                            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
                        }}
                        title="LinkedIn Automation"
                    >
                        <img src="/isotipo.png" alt="Logo" className="w-7 h-7 object-contain" />
                    </div>

                    {/* CRM Group */}
                    {crmGroup.map((item) => (
                        <SidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => !item.disabled && navigate(`/linkedin/${item.id}`)} />
                    ))}

                    <div className="w-8 my-1 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />

                    {/* LinkedIn Group */}
                    {linkedinGroup.map((item) => (
                        <SidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => !item.disabled && navigate(`/linkedin/${item.id}`)} />
                    ))}

                    <div className="w-8 my-1 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />

                    {/* WhatsApp Group */}
                    {whatsappGroup.map((item) => (
                        <SidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => !item.disabled && navigate(`/linkedin/${item.id}`)} />
                    ))}

                    <div className="w-8 my-1 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />

                    {/* Audio Group */}
                    {audioGroup.map((item) => (
                        <SidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => !item.disabled && navigate(`/linkedin/${item.id}`)} />
                    ))}

                    <div className="w-8 my-1 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />

                    {/* Extension Group */}
                    {extensionGroup.map((item) => (
                        <SidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => !item.disabled && navigate(`/linkedin/${item.id}`)} />
                    ))}

                    {/* Platform Switcher */}
                    {hasBothPlatforms && (
                        <>
                            <div className="w-8 my-1 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
                            <SidebarButton
                                Icon={ArrowLeftRight}
                                label="Ir a Operaciones"
                                active={false}
                                onClick={() => navigate('/ops/dashboard')}
                                accentColor="#0ea5e9"
                            />
                        </>
                    )}
                </div>

                {/* Bottom: Back button & Config */}
                <div className="flex flex-col items-center gap-2 pt-4 border-t border-white/10 w-full mt-auto mb-4">
                    {bottomGroup.map((item) => (
                        <SidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => !item.disabled && navigate(`/linkedin/${item.id}`)} />
                    ))}
                </div>
            </aside>

            {/* ── Main Content ──────────────────────────── */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header
                    className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0"
                    style={{
                        background: 'rgba(255, 255, 255, 0.7)',
                        backdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(124, 58, 237, 0.1)',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <h1
                            className="text-xl font-bold"
                            style={{
                                background: 'linear-gradient(90deg, rgb(124, 58, 237), rgb(168, 85, 247)) text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            {activeTab === 'dashboard' ? 'Dashboard CRM' :
                                activeTab === 'pipeline' ? 'Pipeline de Ventas' :
                                    activeTab === 'companies' ? 'Directorio de Empresas' :
                                        activeTab === 'contacts' ? 'Agenda de Contactos' :
                                            activeTab === 'partners' ? 'Partners Oficiales' :
                                                activeTab === 'competitors' ? 'Competidores' :
                                                    activeTab === 'pos-systems' ? 'Sistemas POS' :
                                                        activeTab === 'events' ? 'Eventos y Ferias' :
                                                            activeTab === 'tasks' ? 'Centro de Tareas' :
                                                                activeTab === 'calendar' ? 'Calendario y Citas' :
                                                                    activeTab === 'prospecting-crm' ? 'Prospecting CRM' :
                                                                        activeTab === 'publicaciones' ? 'Publicaciones AI' :
                                                                            activeTab === 'prospecting' ? 'Prospecting Bots' :
                                                                                activeTab === 'voice' ? 'Transcriptor de Audio' :
                                                                                    activeTab === 'whatsapp' ? 'WhatsApp Scheduler' :
                                                                                        activeTab === 'extension' ? 'Extensión Deenex' :
                                                                                            activeTab === 'team' ? 'Equipo y Permisos' :
                                                                                                activeTab === 'profile' ? 'Mi Perfil' : 'Configuración'}
                        </h1>

                    </div>

                    <div className="flex items-center gap-3">
                        <PlatformSwitcher current="comercial" />
                        {/* Portal Target for Page-specific Header Actions */}
                        <div id="header-actions" className="flex items-center gap-4"></div>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-3 md:p-6 pb-20 md:pb-6" style={activeTab === 'voice' || activeTab === 'extension' || activeTab === 'dashboard' || activeTab === 'pipeline' || activeTab === 'companies' || activeTab === 'contacts' || activeTab === 'partners' || activeTab === 'competitors' || activeTab === 'pos-systems' || activeTab === 'events' || activeTab === 'tasks' || activeTab === 'prospecting-crm' ? { paddingLeft: 12, paddingRight: 12, paddingTop: 0, paddingBottom: undefined } : {}}>
                    {activeTab === 'dashboard' && <CRMDashboard />}
                    {activeTab === 'pipeline' && <PipelineBoard urlDealId={id} />}
                    {activeTab === 'companies' && <CompanyList urlCompanyId={id} />}
                    {activeTab === 'contacts' && <ContactList urlContactId={id} />}
                    {activeTab === 'partners' && <PartnerList />}
                    {activeTab === 'competitors' && <CompetitorList />}
                    {activeTab === 'pos-systems' && <PosSystemList />}
                    {activeTab === 'events' && <EventFairList />}
                    {activeTab === 'tasks' && <TaskList urlTaskId={id} />}
                    {activeTab === 'calendar' && <CalendarPage urlEventId={id} />}
                    {activeTab === 'prospecting-crm' && <CRMPage />}
                    {activeTab === 'publicaciones' && <PublicacionesPage />}
                    {activeTab === 'prospecting' && <ProspectingPage />}
                    {activeTab === 'config' && <ConfigPage />}
                    {activeTab === 'whatsapp' && <WhatsAppPage />}
                    {activeTab === 'voice' && <VoiceCommandPage />}
                    {activeTab === 'extension' && <ExtensionPage />}
                    {activeTab === 'team' && <TeamPermissions />}
                    {activeTab === 'profile' && <ProfileSettings />}
                </div>
            </main>

            {/* ── Mobile Bottom Nav ──────────────────────── */}
            <MobileBottomNav activeTab={activeTab} onMoreClick={() => setShowMore(true)} />

            {/* ── Mobile More Page ────────────────────────── */}
            {showMore && (
                <MobileMorePage activeTab={activeTab} onClose={() => setShowMore(false)} />
            )}
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
    accentColor,
}: {
    Icon: React.ElementType;
    label: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    accentColor?: string;
}) {
    const [hovered, setHovered] = useState(false);
    const accent = accentColor || '#7c3aed';
    const accentLight = accentColor || '#a78bfa';

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
                        ? `${accent}33`
                        : hovered && !disabled
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'transparent',
                    transform: hovered && !disabled ? 'scale(1.1)' : 'scale(1)',
                    boxShadow: active ? `0 0 15px ${accent}4D` : 'none',
                }}
            >
                {/* Active indicator bar */}
                {active && (
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{
                            background: `linear-gradient(180deg, ${accentLight}, ${accent})`,
                            boxShadow: `0 0 8px ${accent}99`,
                        }}
                    />
                )}
                <Icon size={20} color={active ? '#e9d5ff' : disabled ? '#6b7280' : accentLight} />
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
