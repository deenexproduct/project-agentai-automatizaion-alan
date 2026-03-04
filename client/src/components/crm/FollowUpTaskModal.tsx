import { useState, useEffect } from 'react';
import { CalendarPlus, X, Clock, ChevronDown } from 'lucide-react';
import { TaskData, createTask } from '../../services/crm.service';
import { getFollowUpDateOptions } from '../../utils/date';

interface Props {
    /** The task that was just completed */
    completedTask: TaskData;
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

export default function FollowUpTaskModal({ completedTask, open, onClose, onCreated }: Props) {
    const [dateOptions] = useState(() => getFollowUpDateOptions());
    const [selectedDateIdx, setSelectedDateIdx] = useState(2); // Default: 3 business days
    const [selectedTime, setSelectedTime] = useState('09:00');
    const [creating, setCreating] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Reset on open
    useEffect(() => {
        if (open) {
            setSelectedDateIdx(2);
            setSelectedTime('09:00');
            setCreating(false);
            setDropdownOpen(false);
        }
    }, [open]);

    if (!open) return null;

    // Build contextual title: "Seguimiento a [persona] - [empresa]"
    const parts: string[] = [];
    if (completedTask.contact?.fullName) parts.push(completedTask.contact.fullName);
    if (completedTask.company?.name) parts.push(completedTask.company.name);

    const followUpTitle = parts.length > 0
        ? `Seguimiento a ${parts.join(' - ')}`
        : `Seguimiento de: ${completedTask.title}`;

    const selectedOption = dateOptions[selectedDateIdx];

    const handleCreate = async () => {
        setCreating(true);
        try {
            // Calculate due date: selected date + selected time
            const datePart = selectedOption.value.split('T')[0]; // "YYYY-MM-DD"
            const dueDate = `${datePart}T${selectedTime}:00.000Z`;

            const assignedToRaw = (completedTask as any).assignedTo;
            const assignedToId = assignedToRaw
                ? (typeof assignedToRaw === 'string' ? assignedToRaw : assignedToRaw._id || null)
                : null;

            const payload: Record<string, any> = {
                title: followUpTitle,
                type: 'follow_up',
                priority: 'high',
                status: 'pending',
                dueDate,
                durationMinutes: 30,
                assignedTo: assignedToId,
            };
            if (completedTask.company?._id) payload.company = completedTask.company._id;
            if (completedTask.contact?._id) payload.contact = completedTask.contact._id;
            if (completedTask.deal?._id) payload.deal = completedTask.deal._id;

            console.log('[FollowUp] Creating task with payload:', JSON.stringify(payload, null, 2));
            console.log('[FollowUp] completedTask data:', JSON.stringify({
                company: completedTask.company,
                contact: completedTask.contact,
                deal: completedTask.deal,
                assignedTo: (completedTask as any).assignedTo,
            }, null, 2));
            await createTask(payload as any);

            onCreated();
            onClose();
        } catch (error: any) {
            console.error('Error creating follow-up task:', error?.response?.data || error?.message || error);
            alert(`Error al crear tarea de seguimiento: ${error?.response?.data?.error || error?.response?.data?.details || error?.message || 'Error desconocido'}`);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{
                background: 'rgba(15, 23, 42, 0.5)',
                backdropFilter: 'blur(8px)',
                animation: 'followUpFadeIn 0.25s ease-out',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="bg-white rounded-[24px] w-full max-w-[540px] shadow-[0_24px_80px_rgba(0,0,0,0.15)] border border-slate-100 relative overflow-visible"
                style={{ animation: 'followUpSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Top gradient bar */}
                <div className="h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-emerald-400" />

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm z-10"
                >
                    <X size={16} />
                </button>

                <div className="p-6 pb-2">
                    {/* Icon + Title */}
                    <div className="flex items-start gap-4 mb-5">
                        <div className="w-12 h-12 rounded-[16px] bg-gradient-to-br from-violet-100 to-fuchsia-100 border border-violet-200/60 flex items-center justify-center shrink-0 shadow-inner">
                            <CalendarPlus size={24} className="text-violet-600" />
                        </div>
                        <div className="min-w-0 pr-8">
                            <h3 className="text-[18px] font-bold text-slate-800 tracking-tight leading-snug">
                                ¿Crear una tarea de seguimiento?
                            </h3>
                            <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">
                                Crearemos una tarea para que le hagas seguimiento en{' '}
                                <span className="font-semibold text-slate-700">{followUpTitle}</span>
                            </p>
                        </div>
                    </div>

                    {/* Date & Time selectors */}
                    <div className="flex gap-3 mb-5">
                        {/* Date dropdown */}
                        <div className="relative flex-1">
                            <button
                                type="button"
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white border border-slate-200 rounded-[14px] text-[14px] font-medium text-slate-700 hover:border-violet-300 hover:bg-violet-50/30 transition-all shadow-sm cursor-pointer"
                            >
                                <span className="truncate">{selectedOption.label}</span>
                                <ChevronDown size={16} className={`text-slate-400 transition-transform shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {dropdownOpen && (
                                <div
                                    className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-[14px] border border-slate-200 shadow-[0_12px_40px_rgba(0,0,0,0.1)] z-20 overflow-hidden"
                                    style={{ animation: 'followUpFadeIn 0.15s ease-out' }}
                                >
                                    <div className="max-h-[320px] overflow-y-auto py-1.5">
                                        {dateOptions.map((opt, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedDateIdx(idx);
                                                    setDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors ${idx === selectedDateIdx
                                                    ? 'bg-violet-50 text-violet-700 font-semibold'
                                                    : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Time input — wider */}
                        <div className="relative w-[130px] shrink-0">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <Clock size={15} />
                            </div>
                            <input
                                type="time"
                                value={selectedTime}
                                onChange={(e) => setSelectedTime(e.target.value)}
                                className="w-full pl-9 pr-2 py-3 bg-white border border-slate-200 rounded-[14px] text-[14px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all shadow-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="flex-1 py-3 px-5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-[14px] text-[14px] hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none shadow-[0_4px_16px_rgba(139,92,246,0.3)] flex items-center justify-center gap-2"
                    >
                        {creating ? (
                            <span className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                Creando...
                            </span>
                        ) : (
                            <>
                                <CalendarPlus size={16} />
                                Crear tarea
                            </>
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-5 py-3 bg-white border border-slate-200 text-slate-500 font-semibold rounded-[14px] text-[14px] hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 transition-all shadow-sm"
                    >
                        En otro momento
                    </button>
                </div>

                {/* Inline styles for animations */}
                <style>{`
                    @keyframes followUpFadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes followUpSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                `}</style>
            </div>
        </div>
    );
}
