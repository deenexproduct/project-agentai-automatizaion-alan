import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Eye, Link, Hand, Microscope, Clock, CheckCircle, Send, Search, RefreshCw, Loader2, X, Download, Mail } from 'lucide-react';
import ContactCard from './ContactCard';
import ContactDrawer from './ContactDrawer';
import {
    getContacts,
    getCounts,
    updateContactStatus,
    checkAccepted,
    exportContactsUrl,
    type ContactCardData,
    type ContactStatus,
    type StatusCounts,
} from '../../services/linkedin-crm.service';

// ── Column Configuration ─────────────────────────────────────

interface ColumnConfig {
    id: ContactStatus;
    label: string;
    Icon: React.ElementType;
    color: string;
    accentBg: string;
}

const COLUMNS: ColumnConfig[] = [
    { id: 'visitando', label: 'Visitando', Icon: Eye, color: '#06b6d4', accentBg: 'rgba(6,182,212,0.1)' },
    { id: 'conectando', label: 'Conectando', Icon: Link, color: '#eab308', accentBg: 'rgba(234,179,8,0.1)' },
    { id: 'interactuando', label: 'Interactuando', Icon: Hand, color: '#f97316', accentBg: 'rgba(249,115,22,0.1)' },
    { id: 'enriqueciendo', label: 'Enriqueciendo', Icon: Microscope, color: '#a855f7', accentBg: 'rgba(168,85,247,0.1)' },
    { id: 'esperando_aceptacion', label: 'En Espera', Icon: Clock, color: '#f59e0b', accentBg: 'rgba(245,158,11,0.1)' },
    { id: 'aceptado', label: 'Aceptado', Icon: CheckCircle, color: '#10b981', accentBg: 'rgba(16,185,129,0.1)' },
    { id: 'mensaje_enviado', label: 'Completado', Icon: Send, color: '#8b5cf6', accentBg: 'rgba(139,92,246,0.1)' },
];

// Valid drag transitions (only forward)
const VALID_TRANSITIONS: Record<ContactStatus, ContactStatus[]> = {
    visitando: ['conectando'],
    conectando: ['interactuando'],
    interactuando: ['enriqueciendo'],
    enriqueciendo: ['esperando_aceptacion'],
    esperando_aceptacion: ['aceptado'],
    aceptado: ['mensaje_enviado'],
    mensaje_enviado: [],
};

// ── Component ────────────────────────────────────────────────

export default function CRMPage() {
    const [columns, setColumns] = useState<Record<ContactStatus, ContactCardData[]>>({
        visitando: [], conectando: [], interactuando: [], enriqueciendo: [],
        esperando_aceptacion: [], aceptado: [], mensaje_enviado: [],
    });
    const [counts, setCounts] = useState<StatusCounts>({ visitando: 0, conectando: 0, interactuando: 0, enriqueciendo: 0, esperando_aceptacion: 0, aceptado: 0, mensaje_enviado: 0 });
    const [pages, setPages] = useState<Record<ContactStatus, number>>({ visitando: 1, conectando: 1, interactuando: 1, enriqueciendo: 1, esperando_aceptacion: 1, aceptado: 1, mensaje_enviado: 1 });
    const [hasMore, setHasMore] = useState<Record<ContactStatus, boolean>>({ visitando: true, conectando: true, interactuando: true, enriqueciendo: true, esperando_aceptacion: true, aceptado: true, mensaje_enviado: true });
    const [search, setSearch] = useState('');
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<{ found: number; updated: number } | null>(null);
    const [loading, setLoading] = useState(true);

    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setHeaderTarget(document.getElementById('header-actions'));
    }, []);

    // ── Load data ──────────────────────────────────────────────

    const loadColumn = useCallback(async (status: ContactStatus, page: number = 1, append: boolean = false) => {
        try {
            const data = await getContacts(status, search || undefined, page, 50);
            setColumns(prev => ({
                ...prev,
                [status]: append ? [...prev[status], ...data.contacts] : data.contacts,
            }));
            setPages(prev => ({ ...prev, [status]: page }));
            setHasMore(prev => ({ ...prev, [status]: page < data.pages }));
        } catch { /* ignore */ }
    }, [search]);

    const loadAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [visData, conxData, intData, enrData, espData, acpData, msgData, countsData] = await Promise.all([
                getContacts('visitando', search || undefined, 1, 50),
                getContacts('conectando', search || undefined, 1, 50),
                getContacts('interactuando', search || undefined, 1, 50),
                getContacts('enriqueciendo', search || undefined, 1, 50),
                getContacts('esperando_aceptacion', search || undefined, 1, 50),
                getContacts('aceptado', search || undefined, 1, 50),
                getContacts('mensaje_enviado', search || undefined, 1, 50),
                getCounts(),
            ]);

            setColumns({
                visitando: visData.contacts,
                conectando: conxData.contacts,
                interactuando: intData.contacts,
                enriqueciendo: enrData.contacts,
                esperando_aceptacion: espData.contacts,
                aceptado: acpData.contacts,
                mensaje_enviado: msgData.contacts,
            });
            setCounts(countsData);
            setPages({ visitando: 1, conectando: 1, interactuando: 1, enriqueciendo: 1, esperando_aceptacion: 1, aceptado: 1, mensaje_enviado: 1 });
            setHasMore({
                visitando: 1 < visData.pages,
                conectando: 1 < conxData.pages,
                interactuando: 1 < intData.pages,
                enriqueciendo: 1 < enrData.pages,
                esperando_aceptacion: 1 < espData.pages,
                aceptado: 1 < acpData.pages,
                mensaje_enviado: 1 < msgData.pages,
            });
        } catch { /* ignore */ }
        if (!silent) setLoading(false);
    }, [search]);

    // Initial load
    useEffect(() => { loadAll(false); }, [loadAll]);

    // Auto-refresh (Real-time movement effect)
    useEffect(() => {
        const interval = setInterval(() => {
            loadAll(true);
        }, 5000);
        return () => clearInterval(interval);
    }, [loadAll]);

    // ── Search with debounce ─────────────────────────────────

    const handleSearchChange = (value: string) => {
        setSearch(value);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            // loadAll is memoized with search dependency
        }, 300);
    };

    // ── Infinite scroll ──────────────────────────────────────

    const handleScroll = (status: ContactStatus, e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100 && hasMore[status]) {
            const nextPage = pages[status] + 1;
            loadColumn(status, nextPage, true);
        }
    };

    // ── Drag & Drop ──────────────────────────────────────────

    const onDragEnd = async (result: DropResult) => {
        const { source, destination, draggableId } = result;
        if (!destination) return;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const fromStatus = source.droppableId as ContactStatus;
        const toStatus = destination.droppableId as ContactStatus;

        // Validate transition
        if (fromStatus !== toStatus && !VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) {
            return; // Invalid transition blocked
        }

        // Find the contact
        const contact = columns[fromStatus].find(c => c._id === draggableId);
        if (!contact) return;

        // Optimistic update
        setColumns(prev => {
            const newFrom = [...prev[fromStatus]];
            const fromIdx = newFrom.findIndex(c => c._id === draggableId);
            if (fromIdx >= 0) newFrom.splice(fromIdx, 1);

            if (fromStatus === toStatus) {
                // Reorder within same column
                newFrom.splice(destination.index, 0, contact);
                return { ...prev, [fromStatus]: newFrom };
            }

            const newTo = [...prev[toStatus]];
            const updatedContact = { ...contact, status: toStatus };
            newTo.splice(destination.index, 0, updatedContact);

            return { ...prev, [fromStatus]: newFrom, [toStatus]: newTo };
        });

        // Update counts optimistically
        if (fromStatus !== toStatus) {
            setCounts(prev => ({
                ...prev,
                [fromStatus]: Math.max(0, prev[fromStatus] - 1),
                [toStatus]: prev[toStatus] + 1,
            }));

            // Sync with backend
            try {
                await updateContactStatus(draggableId, toStatus);
            } catch {
                // Revert on error
                loadAll();
            }
        }
    };

    // ── Check Accepted ───────────────────────────────────────

    const handleCheckAccepted = async () => {
        if (checking) return;
        setChecking(true);
        setCheckResult(null);
        try {
            const result = await checkAccepted();
            setCheckResult(result);
            if (result.updated > 0) {
                await loadAll();
            }
        } catch (err: any) {
            setCheckResult({ found: -1, updated: 0 });
        }
        setChecking(false);
        setTimeout(() => setCheckResult(null), 5000);
    };

    // ── Render ────────────────────────────────────────────────

    const totalContacts = Object.values(counts).reduce((a, b) => a + b, 0);

    const headerContent = (
        <div className="flex flex-wrap items-center gap-3">
            {/* Check result toast inside header */}
            {checkResult && (
                <div
                    className="px-4 py-2 rounded-full text-[13px] font-semibold flex items-center gap-2 shadow-sm"
                    style={{
                        background: checkResult.found === -1
                            ? 'linear-gradient(135deg, #fecaca, #fca5a5)'
                            : checkResult.updated > 0
                                ? 'linear-gradient(135deg, #a7f3d0, #6ee7b7)'
                                : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                        color: checkResult.found === -1
                            ? '#991b1b'
                            : checkResult.updated > 0
                                ? '#065f46'
                                : '#92400e',
                        animation: 'fadeInSlideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    }}
                >
                    {checkResult.found === -1 ? (
                        <><X size={14} /> Error verificar</>
                    ) : checkResult.updated > 0 ? (
                        <><CheckCircle size={14} /> {checkResult.updated} nuevos aceptados!</>
                    ) : (
                        <><Mail size={14} /> Sin nuevos aceptados</>
                    )}
                </div>
            )}

            {/* Status Badge */}
            <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/80 shadow-sm mr-2">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                <span className="text-[13px] font-bold text-slate-700">
                    {totalContacts} Perfiles en Funnel
                </span>
            </div>

            {/* Search - Glass Input */}
            <div className="relative group/search">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Buscar leads..."
                    className="w-48 lg:w-64 text-[13px] pl-10 pr-4 py-2 rounded-full border border-white/60 bg-white/40 backdrop-blur-md text-slate-800 focus:bg-white/80 focus:border-violet-300 focus:outline-none transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)] group-hover/search:shadow-[0_4px_12px_rgba(124,58,237,0.06)] placeholder-slate-500 font-medium"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover/search:text-violet-500 transition-colors" size={15} />
            </div>

            {/* Export button */}
            <button
                onClick={() => window.open(exportContactsUrl(), '_blank')}
                className="group flex items-center justify-center gap-2 px-5 py-2 rounded-full text-[13px] font-bold transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                style={{
                    background: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(10px)',
                    color: '#4f46e5', // Indigo
                    border: '1px solid rgba(255, 255, 255, 0.8)',
                }}
            >
                <Download size={15} className="group-hover:translate-y-[1px] transition-transform" />
                Exportar CSV
            </button>

            {/* Check accepted - Glowing Action Button */}
            <button
                onClick={handleCheckAccepted}
                disabled={checking}
                className="group relative overflow-hidden flex items-center justify-center gap-2 px-5 py-2 rounded-full text-[13px] font-bold text-white transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 border border-white/20"
                style={{
                    background: checking
                        ? '#cbd5e1'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    boxShadow: !checking ? '0 4px 14px rgba(16,185,129,0.3)' : 'none',
                }}
            >
                {!checking && (
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                )}
                <div className="relative flex items-center gap-2">
                    {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} className="group-hover:rotate-180 transition-transform duration-500" />}
                    {checking ? 'Sincronizando...' : 'Verificar Acuerdos'}
                </div>
            </button>
        </div>
    );

    return (
        <div className="relative flex flex-col h-full overflow-hidden bg-slate-50">

            {/* Atmospheric Background Effects */}
            <div className="absolute pointer-events-none inset-0 overflow-hidden z-0">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-400/20 rounded-full blur-3xl opacity-60 animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute -bottom-40 -left-20 w-[500px] h-[500px] bg-cyan-400/20 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDuration: '12s' }} />
                <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-fuchsia-400/10 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            {/* Render header actions into the portal */}
            {headerTarget && createPortal(headerContent, headerTarget)}

            {/* Main Board Area */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0 pr-2 pt-2 pb-20 md:pb-6 relative z-10">

                {/* Kanban Board */}
                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center p-8 rounded-3xl bg-white/40 backdrop-blur-lg border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.05)]">
                            <div className="relative">
                                <div className="absolute inset-0 border-4 border-violet-200 rounded-full opacity-20"></div>
                                <div className="animate-spin w-12 h-12 border-4 border-transparent border-t-violet-600 rounded-full" />
                            </div>
                            <h3 className="mt-4 font-bold text-slate-700 text-lg">Cargando Funnel</h3>
                            <p className="text-sm text-slate-500 font-medium">Sincronizando contactos...</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-x-auto overflow-y-hidden crm-scroll-container">
                        <DragDropContext onDragEnd={onDragEnd}>
                            <div className="flex gap-4 h-full pl-6 pr-6" style={{ minWidth: 'max-content' }}>
                                {COLUMNS.map((col) => (
                                    <div
                                        key={col.id}
                                        className="flex flex-col min-w-[290px] max-w-[320px] rounded-[24px] h-full transition-all duration-300 border border-white/60 relative overflow-hidden group/board"
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.4)',
                                            backdropFilter: 'blur(16px)',
                                            WebkitBackdropFilter: 'blur(16px)',
                                            boxShadow: '0 4px 24px -6px rgba(0,0,0,0.03), inset 0 0 0 1px rgba(255,255,255,0.4)'
                                        }}
                                    >
                                        {/* Column Header */}
                                        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 relative z-10 border-b border-white/30">
                                            <div className="flex items-center gap-2.5">
                                                <div
                                                    className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm"
                                                    style={{ background: `linear-gradient(135deg, ${col.color}, ${col.color}CC)` }}
                                                >
                                                    <col.Icon size={16} color="white" />
                                                </div>
                                                <h3 className="text-[14px] font-bold text-slate-800 tracking-tight">{col.label}</h3>
                                            </div>
                                            <div
                                                className="text-[11px] font-black px-2.5 py-1 rounded-full border"
                                                style={{
                                                    background: 'rgba(255,255,255,0.8)',
                                                    color: col.color,
                                                    borderColor: `${col.color}30`,
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                }}
                                            >
                                                {counts[col.id]}
                                            </div>
                                        </div>

                                        {/* Droppable area */}
                                        <Droppable droppableId={col.id}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.droppableProps}
                                                    onScroll={(e) => handleScroll(col.id, e)}
                                                    className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-4 pb-4 relative custom-scrollbar"
                                                    style={{
                                                        transition: 'background 0.3s ease',
                                                        background: snapshot.isDraggingOver
                                                            ? `${col.color}15`
                                                            : 'transparent',
                                                    }}
                                                >
                                                    {/* Empty State */}
                                                    {columns[col.id].length === 0 && !snapshot.isDraggingOver && (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                                                            <div
                                                                className="w-16 h-16 rounded-3xl flex items-center justify-center mb-3 mb-2 opacity-50"
                                                                style={{
                                                                    border: `2px dashed ${col.color}`,
                                                                    background: `${col.color}10`
                                                                }}
                                                            >
                                                                <col.Icon size={24} color={col.color} opacity={0.6} />
                                                            </div>
                                                            <p className="text-[13px] font-bold text-slate-400">Sin leads aquí</p>
                                                            <p className="text-[11px] text-slate-400 mt-1 font-medium">Arrastra perfiles a esta fase</p>
                                                        </div>
                                                    )}

                                                    {/* Contacts */}
                                                    {columns[col.id].map((contact, index) => (
                                                        <Draggable
                                                            key={contact._id}
                                                            draggableId={contact._id}
                                                            index={index}
                                                        >
                                                            {(dragProvided) => (
                                                                <ContactCard
                                                                    contact={contact}
                                                                    onClick={() => setDrawerContactId(contact._id)}
                                                                    provided={dragProvided}
                                                                    onEnriched={() => loadAll()}
                                                                />
                                                            )}
                                                        </Draggable>
                                                    ))}

                                                    {provided.placeholder}

                                                    {hasMore[col.id] && (
                                                        <div className="flex justify-center py-3 shrink-0">
                                                            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 bg-white/50 px-3 py-1.5 rounded-full border border-white/60">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                                                                Scroll para cargar más...
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </Droppable>
                                    </div>
                                ))}
                            </div>
                        </DragDropContext>
                    </div>
                )}

                {/* Contact Drawer */}
                <ContactDrawer
                    contactId={drawerContactId}
                    onClose={() => setDrawerContactId(null)}
                />

                {/* Global animation and custom scrollbar styles */}
                <style>{`
                    @keyframes fadeInSlideDown { 
                        from { opacity: 0; transform: translateY(-10px); } 
                        to { opacity: 1; transform: translateY(0); } 
                    }
                    
                    /* Custom elegant scrollbars for columns */
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 4px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(148, 163, 184, 0.2);
                        border-radius: 10px;
                    }
                    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
                        background: rgba(148, 163, 184, 0.4);
                    }

                    /* Horizontal scrollbar for the board */
                    .crm-scroll-container::-webkit-scrollbar {
                        height: 6px;
                    }
                    .crm-scroll-container::-webkit-scrollbar-track {
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 10px;
                        margin: 0 24px;
                    }
                    .crm-scroll-container::-webkit-scrollbar-thumb {
                        background: rgba(124, 58, 237, 0.2);
                        border-radius: 10px;
                    }
                    .crm-scroll-container:hover::-webkit-scrollbar-thumb {
                        background: rgba(124, 58, 237, 0.4);
                    }
                `}</style>
            </div>
        </div>
    );
}
