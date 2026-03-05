import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContacts, ContactData, getTeamUsers, TeamUser } from '../../services/crm.service';
import { getOpsContacts } from '../../services/ops.service';
import { Search, MapPin, Building2, Link2, Plus, Filter, MessageCircle, Mail, Phone, Linkedin } from 'lucide-react';
import ContactFormDrawer from './ContactFormDrawer';
import ContactActivityDrawer from './ContactActivityDrawer';
import OwnerAvatar from '../common/OwnerAvatar';
import PremiumHeader from './PremiumHeader';

export default function ContactList({ onSelectContact, urlContactId, platform }: { onSelectContact?: (id: string) => void, urlContactId?: string, platform?: 'comercial' | 'operaciones' }) {
    const isOps = platform === 'operaciones';
    const basePath = isOps ? '/ops/contacts' : '/linkedin/contacts';
    const [contacts, setContacts] = useState<ContactData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [roleFilter, setRoleFilter] = useState('');
    const [companyFilter, setCompanyFilter] = useState('');
    const [assignedToFilter, setAssignedToFilter] = useState('');
    const [localesFilter, setLocalesFilter] = useState('');
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
    const [isNewDrawerOpen, setIsNewDrawerOpen] = useState(false);
    const [activityContactId, setActivityContactId] = useState<string | null>(null);
    const [activityContactPreview, setActivityContactPreview] = useState<ContactData | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        getTeamUsers().then(setTeamUsers).catch(() => { });
    }, []);

    // Deep-linking effect
    useEffect(() => {
        if (urlContactId) {
            setActivityContactId(urlContactId);
            setActivityContactPreview({ _id: urlContactId } as any);
        } else if (activityContactId && activityContactPreview?._id) {
            setActivityContactId(null);
        }
    }, [urlContactId]);

    // Derive unique companies for the filter
    const uniqueCompanies = Array.from(new Set(
        contacts
            .flatMap(c => {
                const names = [];
                if (c.companies && c.companies.length > 0) {
                    names.push(...c.companies.map(comp => comp.name));
                } else if (c.company?.name) {
                    names.push(c.company.name);
                }
                return names;
            })
            .filter(Boolean)
    )).sort() as string[];

    const filteredContacts = contacts.filter(contact => {
        if (roleFilter && contact.role !== roleFilter) return false;

        if (companyFilter) {
            const hasCompany = (contact.companies && contact.companies.some(c => c.name === companyFilter)) ||
                (contact.company?.name === companyFilter);
            if (!hasCompany) return false;
        }

        if (assignedToFilter && contact.assignedTo?._id !== assignedToFilter) return false;

        if (localesFilter) {
            let maxLocales = contact.company?.localesCount || 0;
            if (contact.companies && contact.companies.length > 0) {
                const multiMax = Math.max(...contact.companies.map((c: any) => c.localesCount || 0));
                maxLocales = Math.max(maxLocales, multiMax);
            }

            if (localesFilter === '0-10' && (maxLocales < 0 || maxLocales > 10)) return false;
            if (localesFilter === '11-50' && (maxLocales < 11 || maxLocales > 50)) return false;
            if (localesFilter === '51-100' && (maxLocales < 51 || maxLocales > 100)) return false;
            if (localesFilter === '100+' && maxLocales <= 100) return false;
        }

        return true;
    });

    const loadContacts = async () => {
        setLoading(true);
        try {
            if (isOps) {
                const data = await getOpsContacts();
                setContacts(data);
            } else {
                const res = await getContacts({ search, limit: 100 });
                setContacts(res.contacts);
            }
        } catch (error) {
            console.error("Failed to load contacts", error);
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    useEffect(() => {
        const timeout = setTimeout(() => {
            loadContacts();
        }, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    const handleOpenContact = (contact: ContactData) => {
        if (onSelectContact) {
            onSelectContact(contact._id);
            return;
        }
        navigate(`${basePath}/${contact._id}`);
    };

    const handleAdd = () => {
        setIsNewDrawerOpen(true);
    };

    const handleSaved = (savedContact: ContactData & { _deleted?: boolean }) => {
        if (savedContact._deleted) {
            setContacts(prev => prev.filter(c => c._id !== savedContact._id));
            return;
        }
        // Check if it exists already (edit) or is new
        setContacts(prev => {
            const exists = prev.find(c => c._id === savedContact._id);
            if (exists) return prev.map(c => c._id === savedContact._id ? savedContact : c);
            return [savedContact, ...prev];
        });
    };

    const getChannelIcon = (channel: string) => {
        switch (channel) {
            case 'whatsapp': return <MessageCircle size={14} className="text-green-500" />;
            case 'linkedin': return <Linkedin size={14} className="text-blue-500" />;
            case 'email': return <Mail size={14} className="text-amber-500" />;
            case 'phone': return <Phone size={14} className="text-emerald-500" />;
            default: return null;
        }
    };

    const getRoleBadgeColor = (role: string) => {
        if (!role) return 'bg-slate-100 text-slate-700 border-slate-200';
        return 'bg-purple-100 text-purple-700 border-purple-200';
    };

    const formatRole = (role: string) => {
        if (!role) return 'Sin rol';
        return role;
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Premium Header Reutilizable */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    onAdd={handleAdd}
                    addLabel="Añadir Contacto"
                    onFilter={() => setShowFilters(!showFilters)}
                    showFilters={showFilters}
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                />
            </div>

            <div className="flex-1 bg-white/40 backdrop-blur-2xl rounded-[32px] shadow-[0_8px_32px_rgba(30,27,75,0.05)] border border-white/60 overflow-hidden relative flex flex-col">
                {/* Filter Bar */}
                {showFilters && (
                    <div className="px-4 md:px-6 py-3 border-b border-white/50 bg-white/40 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 animate-in fade-in slide-in-from-top-2 shrink-0">
                        <div className="flex bg-white/50 backdrop-blur-md rounded-[10px] p-1 shadow-sm border border-slate-200/60 divide-x divide-slate-200">
                            <div className="flex items-center gap-2 px-3">
                                <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Responsable:</span>
                                <select
                                    value={assignedToFilter}
                                    onChange={(e) => setAssignedToFilter(e.target.value)}
                                    className="text-[13px] font-medium text-slate-700 bg-transparent py-1.5 focus:outline-none cursor-pointer"
                                >
                                    <option value="">Todos</option>
                                    {teamUsers.map(user => (
                                        <option key={user._id} value={user._id}>{user.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 px-3">
                                <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Rol:</span>
                                <select
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="text-[13px] font-medium text-slate-700 bg-transparent py-1.5 focus:outline-none cursor-pointer"
                                >
                                    <option value="">Todos</option>
                                    <option value="decision_maker">Decisor</option>
                                    <option value="influencer">Influenciador</option>
                                    <option value="evaluator">Evaluador</option>
                                    <option value="user">Usuario</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 px-3">
                                <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Empresa:</span>
                                <select
                                    value={companyFilter}
                                    onChange={(e) => setCompanyFilter(e.target.value)}
                                    className="text-[13px] font-medium text-slate-700 bg-transparent py-1.5 w-32 focus:outline-none cursor-pointer"
                                >
                                    <option value="">Todas</option>
                                    {uniqueCompanies.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 px-3">
                                <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Locales:</span>
                                <select
                                    value={localesFilter}
                                    onChange={(e) => setLocalesFilter(e.target.value)}
                                    className="text-[13px] font-medium text-slate-700 bg-transparent py-1.5 w-32 focus:outline-none cursor-pointer"
                                >
                                    <option value="">Todos</option>
                                    <option value="0-10">0 a 10</option>
                                    <option value="11-50">11 a 50</option>
                                    <option value="51-100">51 a 100</option>
                                    <option value="100+">Más de 100</option>
                                </select>
                            </div>
                        </div>
                        {(roleFilter || companyFilter || assignedToFilter || localesFilter) && (
                            <button
                                onClick={() => { setRoleFilter(''); setCompanyFilter(''); setAssignedToFilter(''); setLocalesFilter(''); }}
                                className="text-[12px] font-bold text-slate-400 hover:text-slate-600 transition-colors bg-white/50 px-3 py-1.5 rounded-[8px] border border-slate-200/60"
                            >
                                Limpiar Filtros
                            </button>
                        )}
                    </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto p-3 md:p-6 hidden-scrollbar bg-white/20">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {[4, 5, 6, 7].map(i => (
                                <div key={i} className="bg-white/40 backdrop-blur-md rounded-[24px] p-6 border border-white/60 shadow-sm animate-pulse h-48" />
                            ))}
                        </div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in-95 duration-300">
                            <div className="relative">
                                <div className="absolute inset-0 bg-violet-500/10 rounded-full blur-2xl flex items-center justify-center mb-5" />
                                <div className="w-24 h-24 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)] relative z-10 mx-auto">
                                    <span className="text-4xl drop-shadow-sm">{search ? '🔍' : '👥'}</span>
                                </div>
                            </div>
                            <h3 className="text-[20px] font-black text-slate-700 tracking-tight">
                                {search ? 'Sin resultados' : 'Tu agenda está vacía'}
                            </h3>
                            <p className="text-slate-500 text-[15px] font-medium max-w-sm mt-2 mb-8 leading-relaxed">
                                {search
                                    ? `No encontramos contactos que coincidan con "${search}".`
                                    : 'Comienza a construir tu red agregando tu primer contacto.'}
                            </p>
                            {search ? (
                                <button
                                    onClick={() => setSearch('')}
                                    className="px-6 py-2.5 bg-white/60 hover:bg-white/90 backdrop-blur-sm border border-slate-200/60 rounded-xl text-slate-600 font-bold transition-all shadow-sm"
                                >
                                    Limpiar Búsqueda
                                </button>
                            ) : (
                                <button
                                    onClick={handleAdd}
                                    className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all rounded-xl text-white font-bold shadow-[0_4px_16px_rgba(139,92,246,0.3)]"
                                >
                                    Añadir Contacto
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredContacts.map(contact => (
                                <button
                                    key={contact._id}
                                    onClick={() => handleOpenContact(contact)}
                                    className="group bg-white/90 backdrop-blur-xl rounded-[20px] p-4 border border-slate-200/60 shadow-sm hover:shadow-[0_8px_24px_rgba(139,92,246,0.08)] hover:border-violet-200 transition-all duration-300 text-left flex flex-col gap-3 relative overflow-hidden active:scale-[0.98]"
                                >
                                    {/* Decorative Glow */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-0 blur-xl" />

                                    {/* Avatar, Name, Position */}
                                    <div className="relative z-10 flex items-center gap-3 w-full">
                                        <div className="w-[48px] h-[48px] rounded-[14px] bg-slate-50 border border-slate-200/60 flex flex-col items-center justify-center shrink-0 overflow-hidden group-hover:border-violet-200 transition-colors">
                                            {contact.profilePhotoUrl ? (
                                                <img src={contact.profilePhotoUrl} alt={contact.fullName} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="font-black text-violet-500 text-[18px] tracking-tight">
                                                    {contact.fullName.substring(0, 2).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <h3 className="font-bold text-slate-800 truncate text-[14.5px] group-hover:text-violet-600 transition-colors leading-tight">
                                                {contact.fullName}
                                            </h3>
                                            <p className="text-[12.5px] font-medium text-slate-500 truncate mt-0.5">
                                                {contact.position || 'Sin cargo'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Divider sutil */}
                                    <div className="w-full border-t border-slate-100 relative z-10" />

                                    {/* Bottom Info Row */}
                                    <div className="relative z-10 flex items-center justify-between w-full mt-auto pt-1 gap-2">
                                        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                            {/* Container for Companies with horizontal scroll hidden visually */}
                                            <div className="flex items-center gap-1.5 overflow-x-auto hidden-scrollbar shrink min-w-0" style={{ maskImage: 'linear-gradient(to right, black 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)' }}>
                                                {contact.companies && contact.companies.length > 0 ? (
                                                    contact.companies.map(comp => (
                                                        <div key={comp._id} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-[6px] border border-slate-200/50 shrink-0">
                                                            <Building2 size={12} className="text-slate-400 shrink-0" />
                                                            <span className="truncate max-w-[110px]">{comp.name}</span>
                                                        </div>
                                                    ))
                                                ) : contact.company ? (
                                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-[6px] border border-slate-200/50 shrink-0">
                                                        <Building2 size={12} className="text-slate-400 shrink-0" />
                                                        <span className="truncate max-w-[110px]">{contact.company.name}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 italic bg-white px-2 py-1 rounded-[6px] border border-transparent shrink-0">
                                                        <Building2 size={12} className="text-slate-300 shrink-0" />
                                                        <span className="truncate">Sin empresa</span>
                                                    </div>
                                                )}
                                            </div>
                                            <span className={`shrink-0 px-2 py-1 rounded-[6px] text-[9.5px] font-bold uppercase tracking-wider ${contact.role === 'decision_maker' ? 'bg-violet-50 text-violet-600 border border-violet-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                                                {formatRole(contact.role)}
                                            </span>
                                        </div>

                                        <div className="shrink-0 flex items-center gap-1.5 ml-auto">
                                            <OwnerAvatar name={contact.assignedTo?.name} profilePhotoUrl={contact.assignedTo?.profilePhotoUrl} size="xs" />
                                            {contact.linkedInContactId || contact.linkedInProfileUrl ? (
                                                <a
                                                    href={contact.linkedInProfileUrl || `https://linkedin.com/in/${contact.linkedInContactId}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-[28px] h-[28px] flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-[#0a66c2] hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm"
                                                    title="Ver perfil de LinkedIn"
                                                >
                                                    <Linkedin size={13} />
                                                </a>
                                            ) : (
                                                <div className="w-[28px] h-[28px] flex items-center justify-center rounded-[6px] border border-transparent text-slate-300" title={contact.channel || 'Sin LinkedIn'}>
                                                    <Linkedin size={13} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            <style>{`
                .hidden-scrollbar::-webkit-scrollbar { display: none; }
                .hidden-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <ContactFormDrawer
                open={isNewDrawerOpen}
                contact={null}
                onClose={() => setIsNewDrawerOpen(false)}
                onSaved={handleSaved}
            />

            <ContactActivityDrawer
                contactId={activityContactId}
                contactPreview={activityContactPreview}
                open={!!activityContactId}
                onClose={() => {
                    setActivityContactId(null);
                    if (urlContactId) navigate(basePath);
                }}
                onSaved={handleSaved}
            />
        </div>
    );
}
