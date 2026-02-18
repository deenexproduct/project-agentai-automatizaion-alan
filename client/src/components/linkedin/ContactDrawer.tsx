import { useState, useEffect, useRef } from 'react';
import { 
    Eye, Link, Hand, Microscope, Clock, CheckCircle, Send, X, Loader2, RefreshCw,
    Briefcase, GraduationCap, Building2, Globe, Newspaper, Lightbulb, TrafficCone, Save, MapPin, Store, Folder
} from 'lucide-react';
import type { LinkedInContact, INote } from '../../services/linkedin-crm.service';
import { getContact, addNote, enrichContact } from '../../services/linkedin-crm.service';

// ── Status config ─────────────────────────────────────────────

const STATUS_INFO: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
    visitando: { label: 'Visitando', color: '#06b6d4', Icon: Eye },
    conectando: { label: 'Conectando', color: '#eab308', Icon: Link },
    interactuando: { label: 'Interactuando', color: '#f97316', Icon: Hand },
    enriqueciendo: { label: 'Enriqueciendo', color: '#a855f7', Icon: Microscope },
    esperando_aceptacion: { label: 'Esperando Aceptación', color: '#f59e0b', Icon: Clock },
    aceptado: { label: 'Aceptado', color: '#10b981', Icon: CheckCircle },
    mensaje_enviado: { label: 'Mensaje Enviado', color: '#8b5cf6', Icon: Send },
};

function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ── Component ──────────────────────────────────────────────────

interface Props {
    contactId: string | null;
    onClose: () => void;
}

export default function ContactDrawer({ contactId, onClose }: Props) {
    const [contact, setContact] = useState<LinkedInContact | null>(null);
    const [loading, setLoading] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);

    // Fetch full contact details
    useEffect(() => {
        if (!contactId) { setContact(null); return; }
        setLoading(true);
        getContact(contactId)
            .then(setContact)
            .catch(() => setContact(null))
            .finally(() => setLoading(false));
    }, [contactId]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Close on backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            onClose();
        }
    };

    const handleAddNote = async () => {
        if (!contact || !noteText.trim() || savingNote) return;
        setSavingNote(true);
        try {
            const notes = await addNote(contact._id, noteText.trim());
            setContact({ ...contact, notes });
            setNoteText('');
        } catch { /* ignore */ }
        setSavingNote(false);
    };

    const handleEnrich = async () => {
        if (!contact || enriching) return;
        setEnriching(true);
        try {
            const result = await enrichContact(contact._id);
            if (result.contact) setContact(result.contact);
            else {
                // Refresh
                const updated = await getContact(contact._id);
                setContact(updated);
            }
        } catch (err: any) {
            console.error('Enrichment failed:', err.message);
        } finally {
            setEnriching(false);
        }
    };

    if (!contactId) return null;

    const StatusIcon = contact ? STATUS_INFO[contact.status]?.Icon : null;

    return (
        <div
            onClick={handleBackdropClick}
            className="fixed inset-0 z-50 flex justify-end"
            style={{
                background: 'rgba(0,0,0,0.3)',
                backdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.2s ease',
            }}
        >
            <div
                ref={drawerRef}
                className="h-full overflow-y-auto"
                style={{
                    width: 420,
                    maxWidth: '100vw',
                    background: 'linear-gradient(180deg, #faf8ff 0%, #f5f0ff 100%)',
                    boxShadow: '-4px 0 30px rgba(124, 58, 237, 0.15)',
                    animation: 'slideInRight 0.3s ease',
                }}
            >
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full" />
                    </div>
                ) : !contact ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        No se encontró el contacto
                    </div>
                ) : (
                    <>
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center z-10 hover:bg-slate-200/60 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}
                        >
                            <X size={16} />
                        </button>

                        {/* Header */}
                        <div className="p-6 pb-4" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(168,85,247,0.05))' }}>
                            <div className="flex items-start gap-4">
                                <div
                                    className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
                                    style={{
                                        width: 64,
                                        height: 64,
                                        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                    }}
                                >
                                    {contact.profilePhotoUrl ? (
                                        <img src={contact.profilePhotoUrl} alt={contact.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <span className="text-white text-xl font-bold">{contact.fullName?.charAt(0)}</span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 pt-1">
                                    <h2 className="text-lg font-bold text-slate-800 leading-tight">{contact.fullName}</h2>
                                    {contact.headline && (
                                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{contact.headline}</p>
                                    )}
                                    {contact.location && (
                                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                            <MapPin size={10} />
                                            {contact.location}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Status badge */}
                            <div className="mt-3 flex items-center gap-2">
                                <span
                                    className="text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1.5"
                                    style={{
                                        background: `${STATUS_INFO[contact.status]?.color}20`,
                                        color: STATUS_INFO[contact.status]?.color,
                                    }}
                                >
                                    {StatusIcon && <StatusIcon size={12} />}
                                    {STATUS_INFO[contact.status]?.label}
                                </span>
                                {contact.connectionDegree && (
                                    <span className="text-xs text-slate-400 px-2 py-1 rounded-full bg-slate-100">
                                        {contact.connectionDegree}
                                    </span>
                                )}
                                {contact.connectionsCount && (
                                    <span className="text-xs text-slate-400 px-2 py-1 rounded-full bg-slate-100 flex items-center gap-1">
                                        <Link size={10} />
                                        {contact.connectionsCount}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Pipeline Timeline */}
                        <div className="px-6 py-4 border-b border-purple-100/50">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pipeline</h3>
                            <div className="space-y-2">
                                {[
                                    { label: 'Visitando', date: contact.createdAt, color: '#06b6d4' },
                                    { label: 'Conectando', date: contact.createdAt, color: '#eab308' },
                                    { label: 'Interactuando', date: contact.interactedAt, color: '#f97316' },
                                    { label: 'Enriqueciendo', date: contact.enrichedAt, color: '#a855f7' },
                                    { label: 'Esperando Aceptación', date: contact.sentAt, color: '#f59e0b' },
                                    { label: 'Aceptado', date: contact.acceptedAt, color: '#10b981' },
                                    { label: 'Mensaje Enviado', date: contact.messageSentAt, color: '#8b5cf6' },
                                ].map((step, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{
                                                background: step.date ? step.color : '#e2e8f0',
                                                boxShadow: step.date ? `0 0 6px ${step.color}40` : 'none',
                                            }}
                                        />
                                        <span className={`text-xs flex-1 ${step.date ? 'text-slate-700' : 'text-slate-300'}`}>
                                            {step.label}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                            {step.date ? formatDate(step.date) : '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* About */}
                        {contact.about && (
                            <div className="px-6 py-4 border-b border-purple-100/50">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Acerca de</h3>
                                <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{contact.about}</p>
                            </div>
                        )}

                        {/* Experience */}
                        {contact.experience?.length > 0 && (
                            <div className="px-6 py-4 border-b border-purple-100/50">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Experiencia</h3>
                                <div className="space-y-3">
                                    {contact.experience.map((exp, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                style={{ background: 'rgba(124,58,237,0.08)' }}
                                            >
                                                {exp.logoUrl ? (
                                                    <img src={exp.logoUrl} alt="" className="w-full h-full object-contain rounded-lg" />
                                                ) : <Briefcase size={14} color="#7c3aed" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">{exp.position}</p>
                                                <p className="text-xs text-slate-500">{exp.company}</p>
                                                {exp.duration && <p className="text-[10px] text-slate-400">{exp.duration}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Education */}
                        {contact.education?.length > 0 && (
                            <div className="px-6 py-4 border-b border-purple-100/50">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Educación</h3>
                                <div className="space-y-3">
                                    {contact.education.map((edu, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                style={{ background: 'rgba(124,58,237,0.08)' }}
                                            >
                                                <GraduationCap size={14} color="#7c3aed" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">{edu.institution}</p>
                                                {edu.degree && <p className="text-xs text-slate-500">{edu.degree}</p>}
                                                {edu.years && <p className="text-[10px] text-slate-400">{edu.years}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Skills */}
                        {contact.skills?.length > 0 && (
                            <div className="px-6 py-4 border-b border-purple-100/50">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Skills</h3>
                                <div className="flex flex-wrap gap-2">
                                    {contact.skills.map((skill, i) => (
                                        <span
                                            key={i}
                                            className="text-xs px-2.5 py-1 rounded-full"
                                            style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}
                                        >
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Enrichment Section */}
                        <div className="px-6 py-4 border-b border-purple-100/50">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Microscope size={12} />
                                    Enriquecimiento
                                </h3>
                                {contact.enrichmentStatus !== 'enriching' && (
                                    <button
                                        onClick={handleEnrich}
                                        disabled={enriching}
                                        className="text-xs px-3 py-1 rounded-full font-medium transition-all flex items-center gap-1"
                                        style={{
                                            background: enriching ? '#e2e8f0' : 'rgba(124,58,237,0.1)',
                                            color: enriching ? '#94a3b8' : '#7c3aed',
                                            cursor: enriching ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {enriching ? (
                                            <><Loader2 size={12} className="animate-spin" /> Enriqueciendo...</>
                                        ) : contact.enrichmentStatus === 'completed' ? (
                                            <><RefreshCw size={12} /> Re-enriquecer</>
                                        ) : (
                                            <><Microscope size={12} /> Enriquecer</>
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* Status banner */}
                            {contact.enrichmentStatus === 'enriching' && (
                                <div className="p-3 rounded-lg mb-3 text-sm flex items-center gap-2" style={{ background: 'rgba(234,179,8,0.1)', color: '#ca8a04' }}>
                                    <Loader2 size={14} className="animate-spin" />
                                    Enriquecimiento en proceso...
                                </div>
                            )}
                            {contact.enrichmentStatus === 'failed' && (
                                <div className="p-3 rounded-lg mb-3 text-sm flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                                    <X size={14} />
                                    El enriquecimiento falló. Intentá de nuevo.
                                </div>
                            )}

                            {/* Enrichment data display */}
                            {contact.enrichmentStatus === 'completed' && contact.enrichmentData && (
                                <div className="space-y-3">
                                    {/* Company info */}
                                    {contact.enrichmentData.company && (
                                        <div className="p-3 rounded-lg bg-white/60 border border-purple-50">
                                            <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                                <Building2 size={12} />
                                                {contact.enrichmentData.company.name || 'Empresa'}
                                            </p>
                                            {contact.enrichmentData.company.description && (
                                                <p className="text-xs text-slate-500 mb-1">{contact.enrichmentData.company.description}</p>
                                            )}
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {contact.enrichmentData.company.locationsCount && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                                        <Store size={10} />
                                                        {contact.enrichmentData.company.locationsCount} locales
                                                    </span>
                                                )}
                                                {contact.enrichmentData.company.sector && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                                        <Folder size={10} />
                                                        {contact.enrichmentData.company.sector}
                                                    </span>
                                                )}
                                                {contact.enrichmentData.company.website && contact.enrichmentData.company.website !== 'No verificado' && (
                                                    <a href={contact.enrichmentData.company.website} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
                                                        <Globe size={10} />
                                                        Web
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Person news */}
                                    {contact.enrichmentData.personNews?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                                <Newspaper size={10} />
                                                Noticias
                                            </p>
                                            {contact.enrichmentData.personNews.slice(0, 3).map((news: any, i: number) => (
                                                <div key={i} className="p-2 rounded-lg bg-white/40 mb-1">
                                                    <p className="text-xs text-slate-700 font-medium">{news.title}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {news.source && <span className="text-[10px] text-slate-400">{news.source}</span>}
                                                        {news.date && <span className="text-[10px] text-slate-400">{news.date}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Key insights */}
                                    {contact.enrichmentData.keyInsights?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                                <Lightbulb size={10} />
                                                Insights
                                            </p>
                                            {contact.enrichmentData.keyInsights.map((insight: any, i: number) => (
                                                <div key={i} className="flex items-start gap-1.5 mb-1">
                                                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                                        insight.confidence === 'high' ? 'bg-green-500' : 
                                                        insight.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-400'
                                                    }`} />
                                                    <div className="flex-1">
                                                        <p className="text-xs text-slate-600">{insight.text || insight}</p>
                                                        {insight.source && insight.source !== 'No verificado' && (
                                                            <span className="text-[10px] text-slate-400">{insight.source}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Buying signals */}
                                    {contact.enrichmentData.buyingSignals?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                                <TrafficCone size={10} />
                                                Señales de Compra
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {contact.enrichmentData.buyingSignals.map((signal: any, i: number) => (
                                                    <span 
                                                        key={i} 
                                                        className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" 
                                                        style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                                                        title={signal.source || ''}
                                                    >
                                                        {signal.text || signal}
                                                        {signal.confidence && (
                                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                                signal.confidence === 'high' ? 'bg-green-500' : 
                                                                signal.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-400'
                                                            }`} />
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Enriched timestamp */}
                                    {contact.enrichedAt && (
                                        <p className="text-[10px] text-slate-400 text-right">
                                            Enriquecido: {formatDate(contact.enrichedAt)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Not enriched yet */}
                            {!contact.enrichmentStatus && !enriching && (
                                <p className="text-xs text-slate-400 italic">Sin datos de enriquecimiento. Hacé click en &quot;Enriquecer&quot; para investigar este contacto.</p>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="px-6 py-4 border-b border-purple-100/50">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                Notas ({contact.notes?.length || 0})
                            </h3>

                            {/* Add note input */}
                            <div className="flex gap-2 mb-3">
                                <input
                                    type="text"
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                                    placeholder="Agregar nota..."
                                    className="flex-1 text-sm px-3 py-2 rounded-lg border border-purple-100 focus:border-purple-300 focus:outline-none bg-white/70"
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={!noteText.trim() || savingNote}
                                    className="px-3 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
                                >
                                    {savingNote ? '...' : <Save size={16} />}
                                </button>
                            </div>

                            {/* Notes list */}
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {(contact.notes || []).slice().reverse().map((note: INote, i: number) => (
                                    <div key={note._id || i} className="p-2.5 rounded-lg bg-white/60 border border-purple-50">
                                        <p className="text-sm text-slate-700">{note.text}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            {formatDate(note.createdAt)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* View on LinkedIn */}
                        <div className="px-6 py-4">
                            <a
                                href={contact.profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                                style={{
                                    background: 'linear-gradient(135deg, #0077B5, #0a66c2)',
                                    color: 'white',
                                }}
                            >
                                <Link size={16} />
                                Ver en LinkedIn
                            </a>
                        </div>
                    </>
                )}
            </div>

            {/* Animations */}
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </div>
    );
}
