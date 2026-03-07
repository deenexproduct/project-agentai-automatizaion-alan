import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, Columns3, CheckSquare, Target, User, ArrowLeftRight, Settings, Users, Building2, Monitor, Activity, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PlatformSwitcher from '../common/PlatformSwitcher';
import OpsDashboard from './OpsDashboard';
import PipelineBoard from '../crm/PipelineBoard';
import OpsTaskList from './OpsTaskList';
import OpsGoals from './OpsGoals';
import CompanyList from '../crm/CompanyList';
import ContactList from '../crm/ContactList';
import ProfileSettings from '../settings/ProfileSettings';
import TeamPermissions from '../team/TeamPermissions';
import DeenexMonitoring from './DeenexMonitoring';
import OpsActivity from './OpsActivity';
import OpsReports from './OpsReports';

type OpsTab = 'dashboard' | 'pipeline' | 'tasks' | 'goals' | 'activity' | 'reports' | 'companies' | 'contacts' | 'monitoring' | 'profile' | 'team';

interface SidebarItem {
    id: OpsTab;
    Icon: React.ElementType;
    label: string;
}

const opsGroup: SidebarItem[] = [
    { id: 'dashboard', Icon: BarChart3, label: 'Estadísticas' },
    { id: 'pipeline', Icon: Columns3, label: 'Pipeline' },
    { id: 'monitoring', Icon: Monitor, label: 'Monitoreo' },
    { id: 'tasks', Icon: CheckSquare, label: 'Tareas' },
    { id: 'goals', Icon: Target, label: 'Objetivos' },
    { id: 'reports', Icon: FileText, label: 'Informes' },
    { id: 'companies', Icon: Building2, label: 'Empresas' },
    { id: 'contacts', Icon: User, label: 'Contactos' },
    { id: 'activity', Icon: Activity, label: 'Actividad Operativa' },
];

const bottomGroup: SidebarItem[] = [
    { id: 'profile', Icon: User, label: 'Mi Perfil' },
    { id: 'team', Icon: Users, label: 'Equipo' },
];

const TAB_TITLES: Record<OpsTab, string> = {
    dashboard: 'Estadísticas Operativas',
    pipeline: 'Pipeline de Operaciones',
    tasks: 'Centro de Tareas',
    goals: 'Objetivos',
    activity: 'Actividad Operativa',
    reports: 'Informes Semanales',
    companies: 'Empresas en Operaciones',
    contacts: 'Contactos de Operaciones',
    monitoring: 'Centro de Monitoreo',
    profile: 'Mi Perfil',
    team: 'Equipo y Permisos',
};

export default function OpsApp() {
    const { tab, id } = useParams<{ tab: string; id?: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const activeTab = (tab as OpsTab) || 'dashboard';

    const hasBothPlatforms = user?.platforms?.includes('comercial') && user?.platforms?.includes('operaciones');

    return (
        <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #dbeafe 100%)' }}>
            {/* ── Sidebar ───────────────────────────────── */}
            <aside
                className="hidden md:flex flex-col items-center justify-between py-6 shrink-0"
                style={{
                    width: 60,
                    background: 'linear-gradient(180deg, #0c1e3a 0%, #1a365d 100%)',
                }}
            >
                <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto w-full pb-4" style={{ scrollbarWidth: 'none' }}>
                    <style>{`.ops-sidebar-scroll::-webkit-scrollbar { display: none; }`}</style>

                    {/* Logo */}
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 cursor-pointer shrink-0 mt-2"
                        style={{
                            background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
                            boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
                        }}
                        title="Deenex Operaciones"
                    >
                        <Settings size={22} color="#fff" />
                    </div>

                    {/* Ops Group */}
                    {opsGroup.map((item) => (
                        <OpsSidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => navigate(`/ops/${item.id}`)} />
                    ))}

                    {/* Platform Switcher */}
                    {hasBothPlatforms && (
                        <>
                            <div className="w-8 my-1 shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
                            <OpsSidebarButton
                                id={'switch' as any}
                                Icon={ArrowLeftRight}
                                label="Ir a Comercial"
                                active={false}
                                onClick={() => navigate('/linkedin/dashboard')}
                                accentColor="#a855f7"
                            />
                        </>
                    )}
                </div>

                {/* Bottom */}
                <div className="flex flex-col items-center gap-2 pt-4 border-t border-white/10 w-full mt-auto mb-4">
                    {bottomGroup.map((item) => (
                        <OpsSidebarButton key={item.id} {...item} active={activeTab === item.id} onClick={() => navigate(`/ops/${item.id}`)} />
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
                        borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <h1
                            className="text-xl font-bold"
                            style={{
                                background: 'linear-gradient(90deg, #0ea5e9, #3b82f6) text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            {TAB_TITLES[activeTab] || 'Operaciones'}
                        </h1>
                    </div>
                    <div id="header-actions" className="flex items-center gap-3">
                        <PlatformSwitcher current="operaciones" />
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-3 md:p-6 pb-20 md:pb-6" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 0 }}>
                    {activeTab === 'dashboard' && <OpsDashboard />}
                    {activeTab === 'pipeline' && <PipelineBoard urlDealId={id} platform="operaciones" />}
                    {activeTab === 'tasks' && <OpsTaskList urlTaskId={id} />}
                    {activeTab === 'goals' && <OpsGoals />}
                    {activeTab === 'activity' && <OpsActivity />}
                    {activeTab === 'reports' && <OpsReports />}
                    {activeTab === 'companies' && <CompanyList urlCompanyId={id} platform="operaciones" />}
                    {activeTab === 'contacts' && <ContactList urlContactId={id} platform="operaciones" />}
                    {activeTab === 'monitoring' && <DeenexMonitoring />}
                    {activeTab === 'profile' && <ProfileSettings />}
                    {activeTab === 'team' && <TeamPermissions />}
                </div>
            </main>
        </div>
    );
}

// ── Sidebar Button Component ────────────────────────────────

function OpsSidebarButton({
    Icon,
    label,
    active,
    onClick,
    accentColor,
}: {
    id: string;
    Icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
    accentColor?: string;
}) {
    const [hovered, setHovered] = useState(false);
    const accent = accentColor || '#3b82f6';
    const accentLight = accentColor || '#93c5fd';

    return (
        <div className="relative group">
            <button
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200"
                style={{
                    cursor: 'pointer',
                    background: active
                        ? `${accent}33`
                        : hovered
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'transparent',
                    transform: hovered ? 'scale(1.1)' : 'scale(1)',
                    boxShadow: active ? `0 0 15px ${accent}4D` : 'none',
                }}
            >
                {active && (
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{
                            background: `linear-gradient(180deg, ${accentLight}, ${accent})`,
                            boxShadow: `0 0 8px ${accent}99`,
                        }}
                    />
                )}
                <Icon size={20} color={active ? '#bfdbfe' : accentLight} />
            </button>

            {hovered && (
                <div
                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap z-50"
                    style={{
                        background: 'rgba(12, 30, 58, 0.95)',
                        color: '#bfdbfe',
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
