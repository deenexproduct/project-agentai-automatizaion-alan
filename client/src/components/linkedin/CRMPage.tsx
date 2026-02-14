import { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import ContactCard from './ContactCard';
import ContactDrawer from './ContactDrawer';
import {
    getContacts,
    getCounts,
    updateContactStatus,
    checkAccepted,
    type ContactCardData,
    type ContactStatus,
    type StatusCounts,
} from '../../services/linkedin-crm.service';

// ── Column Configuration ─────────────────────────────────────

interface ColumnConfig {
    id: ContactStatus;
    label: string;
    icon: string;
    color: string;
    accentBg: string;
}

const COLUMNS: ColumnConfig[] = [
    { id: 'visitando', label: 'Visitando', icon: '👁️', color: '#06b6d4', accentBg: 'rgba(6,182,212,0.08)' },
    { id: 'conectando', label: 'Conectando', icon: '🔗', color: '#eab308', accentBg: 'rgba(234,179,8,0.08)' },
    { id: 'conectado', label: 'Conectado', icon: '✅', color: '#22c55e', accentBg: 'rgba(34,197,94,0.08)' },
    { id: 'interactuando', label: 'Interactuando', icon: '👋', color: '#f97316', accentBg: 'rgba(249,115,22,0.08)' },
    { id: 'esperando_aceptacion', label: 'Esperando Aceptación', icon: '⏳', color: '#f59e0b', accentBg: 'rgba(245,158,11,0.08)' },
    { id: 'aceptado', label: 'Aceptado', icon: '🤝', color: '#10b981', accentBg: 'rgba(16,185,129,0.08)' },
    { id: 'listo_para_mensaje', label: 'Listo p/ Mensaje', icon: '💬', color: '#3b82f6', accentBg: 'rgba(59,130,246,0.08)' },
    { id: 'mensaje_enviado', label: 'Mensaje Enviado', icon: '🚀', color: '#8b5cf6', accentBg: 'rgba(139,92,246,0.08)' },
];

// Valid drag transitions (only forward + listo→aceptado back)
const VALID_TRANSITIONS: Record<ContactStatus, ContactStatus[]> = {
    visitando: ['conectando'],
    conectando: ['conectado'],
    conectado: ['interactuando'],
    interactuando: ['esperando_aceptacion'],
    esperando_aceptacion: ['aceptado'],
    aceptado: ['listo_para_mensaje'],
    listo_para_mensaje: ['aceptado', 'mensaje_enviado'],
    mensaje_enviado: [],
};

// ── Component ────────────────────────────────────────────────

export default function CRMPage() {
    const [columns, setColumns] = useState<Record<ContactStatus, ContactCardData[]>>({
        visitando: [], conectando: [], conectado: [], esperando_aceptacion: [],
        interactuando: [], aceptado: [],
        listo_para_mensaje: [], mensaje_enviado: [],
    });
    const [counts, setCounts] = useState<StatusCounts>({ visitando: 0, conectando: 0, conectado: 0, esperando_aceptacion: 0, interactuando: 0, aceptado: 0, listo_para_mensaje: 0, mensaje_enviado: 0 });
    const [pages, setPages] = useState<Record<ContactStatus, number>>({ visitando: 1, conectando: 1, conectado: 1, esperando_aceptacion: 1, interactuando: 1, aceptado: 1, listo_para_mensaje: 1, mensaje_enviado: 1 });
    const [hasMore, setHasMore] = useState<Record<ContactStatus, boolean>>({ visitando: true, conectando: true, conectado: true, esperando_aceptacion: true, interactuando: true, aceptado: true, listo_para_mensaje: true, mensaje_enviado: true });
    const [search, setSearch] = useState('');
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<{ found: number; updated: number } | null>(null);
    const [loading, setLoading] = useState(true);

    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [visData, conxData, conData, espData, intData, acpData, lisData, msgData, countsData] = await Promise.all([
                getContacts('visitando', search || undefined, 1, 50),
                getContacts('conectando', search || undefined, 1, 50),
                getContacts('conectado', search || undefined, 1, 50),
                getContacts('esperando_aceptacion', search || undefined, 1, 50),
                getContacts('interactuando', search || undefined, 1, 50),
                getContacts('aceptado', search || undefined, 1, 50),
                getContacts('listo_para_mensaje', search || undefined, 1, 50),
                getContacts('mensaje_enviado', search || undefined, 1, 50),
                getCounts(),
            ]);

            setColumns({
                visitando: visData.contacts,
                conectando: conxData.contacts,
                conectado: conData.contacts,
                esperando_aceptacion: espData.contacts,
                interactuando: intData.contacts,
                aceptado: acpData.contacts,
                listo_para_mensaje: lisData.contacts,
                mensaje_enviado: msgData.contacts,
            });
            setCounts(countsData);
            setPages({ visitando: 1, conectando: 1, conectado: 1, esperando_aceptacion: 1, interactuando: 1, aceptado: 1, listo_para_mensaje: 1, mensaje_enviado: 1 });
            setHasMore({
                visitando: 1 < visData.pages,
                conectando: 1 < conxData.pages,
                conectado: 1 < conData.pages,
                esperando_aceptacion: 1 < espData.pages,
                interactuando: 1 < intData.pages,
                aceptado: 1 < acpData.pages,
                listo_para_mensaje: 1 < lisData.pages,
                mensaje_enviado: 1 < msgData.pages,
            });
        } catch { /* ignore */ }
        setLoading(false);
    }, [search]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Search with debounce ─────────────────────────────────

    const handleSearchChange = (value: string) => {
        setSearch(value);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            // loadAll is memoized with search dependency, so it will trigger via useEffect
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
                // Reload to reflect changes
                await loadAll();
            }
        } catch (err: any) {
            setCheckResult({ found: -1, updated: 0 });
        }
        setChecking(false);
        setTimeout(() => setCheckResult(null), 5000);
    };

    // ── Render ────────────────────────────────────────────────

    const totalContacts = counts.conectado + counts.esperando_aceptacion + counts.interactuando + counts.aceptado + counts.listo_para_mensaje + counts.mensaje_enviado;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <h2
                        className="text-lg font-bold"
                        style={{
                            background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Pipeline CRM
                    </h2>
                    <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-600 font-medium">
                        {totalContacts} contactos
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Buscar nombre, cargo, empresa..."
                            className="text-sm pl-9 pr-4 py-2 rounded-xl border border-purple-100 focus:border-purple-300 focus:outline-none bg-white/70 backdrop-blur-sm w-64"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                    </div>

                    {/* Check accepted */}
                    <button
                        onClick={handleCheckAccepted}
                        disabled={checking}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
                        style={{
                            background: checking
                                ? '#94a3b8'
                                : 'linear-gradient(135deg, #10b981, #059669)',
                            boxShadow: !checking ? '0 2px 10px rgba(16,185,129,0.3)' : 'none',
                        }}
                    >
                        <span className={checking ? 'animate-spin' : ''}>🔄</span>
                        {checking ? 'Verificando...' : 'Verificar aceptados'}
                    </button>
                </div>
            </div>

            {/* Check result toast */}
            {checkResult && (
                <div
                    className="mb-3 px-4 py-2 rounded-xl text-sm font-medium"
                    style={{
                        background: checkResult.found === -1
                            ? 'rgba(239,68,68,0.1)'
                            : checkResult.updated > 0
                                ? 'rgba(16,185,129,0.1)'
                                : 'rgba(245,158,11,0.1)',
                        color: checkResult.found === -1
                            ? '#dc2626'
                            : checkResult.updated > 0
                                ? '#059669'
                                : '#d97706',
                        animation: 'fadeIn 0.3s ease',
                    }}
                >
                    {checkResult.found === -1
                        ? '❌ Error al verificar — ¿browser activo y logueado?'
                        : checkResult.updated > 0
                            ? `✅ ${checkResult.updated} conexiones aceptadas actualizadas`
                            : '📭 Sin nuevas aceptaciones encontradas'}
                </div>
            )}

            {/* Kanban Board */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-3" />
                        <p className="text-sm text-slate-400">Cargando contactos...</p>
                    </div>
                </div>
            ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                    <div className="flex-1 flex gap-4 overflow-x-auto pb-2">
                        {COLUMNS.map((col) => (
                            <div
                                key={col.id}
                                className="flex-1 flex flex-col min-w-[260px] max-w-[360px] rounded-2xl"
                                style={{ background: col.accentBg }}
                            >
                                {/* Column Header */}
                                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                                    <div className="flex items-center gap-2">
                                        <span>{col.icon}</span>
                                        <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                                    </div>
                                    <span
                                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                                        style={{ background: `${col.color}20`, color: col.color }}
                                    >
                                        {counts[col.id]}
                                    </span>
                                </div>

                                {/* Droppable area */}
                                <Droppable droppableId={col.id}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            onScroll={(e) => handleScroll(col.id, e)}
                                            className="flex-1 overflow-y-auto px-3 pb-3 min-h-[100px]"
                                            style={{
                                                transition: 'background 0.2s ease',
                                                background: snapshot.isDraggingOver
                                                    ? `${col.color}10`
                                                    : 'transparent',
                                                borderRadius: '0 0 16px 16px',
                                            }}
                                        >
                                            {columns[col.id].length === 0 && !snapshot.isDraggingOver && (
                                                <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                                                    <span className="text-3xl mb-2">{col.icon}</span>
                                                    <p className="text-xs">Sin contactos</p>
                                                </div>
                                            )}

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
                                                        />
                                                    )}
                                                </Draggable>
                                            ))}

                                            {provided.placeholder}

                                            {hasMore[col.id] && (
                                                <div className="flex justify-center py-2">
                                                    <span className="text-xs text-slate-400">Scroll para más...</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Droppable>
                            </div>
                        ))}
                    </div>
                </DragDropContext>
            )}

            {/* Contact Drawer */}
            <ContactDrawer
                contactId={drawerContactId}
                onClose={() => setDrawerContactId(null)}
            />

            {/* Global animation styles */}
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}
