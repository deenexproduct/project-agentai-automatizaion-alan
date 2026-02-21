import { useState, useEffect } from 'react';
import { getTasks, completeTask, updateTask, TaskData } from '../../services/crm.service';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { CheckCircle2, Circle, Clock, Building2, Users, Briefcase, Calendar as CalendarIcon, Search, Plus, AlertCircle, LayoutList, GripVertical } from 'lucide-react';
import { formatToArgentineDateTime, isTodayInArgentina, isOverdueExact } from '../../utils/date';
import TaskFormDrawer from './TaskFormDrawer';
import PremiumHeader from './PremiumHeader';
import OwnerAvatar from '../common/OwnerAvatar';

export default function TaskList() {
    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'today' | 'overdue'>('all');
    const [viewMode, setViewMode] = useState<'date' | 'kanban'>('date');
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<TaskData | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const params: any = { limit: 100 };
            if (viewMode === 'date') {
                params.status = 'pending,in_progress';
                if (filter === 'overdue') params.overdue = true;
            }

            const res = await getTasks(params);
            let filteredTasks = res.tasks;

            if (viewMode === 'date' && filter === 'today') {
                filteredTasks = filteredTasks.filter(t => t.dueDate && isTodayInArgentina(t.dueDate));
            }
            if (search) {
                filteredTasks = filteredTasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
            }

            setTasks(filteredTasks);
        } catch (error) {
            console.error("Failed to load tasks", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeout = setTimeout(loadData, 300);
        return () => clearTimeout(timeout);
    }, [search, filter, viewMode]);

    const handleDragEnd = async (result: DropResult) => {
        if (!result.destination) return;
        const { source, destination, draggableId } = result;

        if (source.droppableId === destination.droppableId) return;

        const task = tasks.find(t => t._id === draggableId);
        if (!task) return;

        const newStatus = destination.droppableId as TaskData['status'];

        // Optimistic update
        setTasks(prev => prev.map(t => t._id === draggableId ? { ...t, status: newStatus } : t));

        try {
            if (newStatus === 'completed' && task.status !== 'completed') {
                await completeTask(draggableId);
            } else {
                await updateTask(draggableId, { status: newStatus });
            }
        } catch (error) {
            console.error("Failed to move task", error);
            loadData(); // revert
        }
    };

    const handleEdit = (task: TaskData, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingTask(task);
        setIsDrawerOpen(true);
    };

    const handleAdd = () => {
        setEditingTask(null);
        setIsDrawerOpen(true);
    };

    const handleComplete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            setTasks(prev => prev.filter(t => t._id !== id));
            await completeTask(id);
        } catch (error) {
            console.error("Failed to complete task", error);
            loadData();
        }
    };

    const getTypeInfo = (type: string) => {
        switch (type) {
            case 'call': return { label: 'Llamada', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
            case 'meeting': return { label: 'Reunión', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' };
            case 'email': return { label: 'Email', color: 'text-amber-600 bg-amber-50 border-amber-200' };
            case 'follow_up': return { label: 'Seguimiento', color: 'text-blue-600 bg-blue-50 border-blue-200' };
            case 'proposal': return { label: 'Propuesta', color: 'text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200' };
            case 'research': return { label: 'Investigación', color: 'text-purple-600 bg-purple-50 border-purple-200' };
            default: return { label: 'Otro', color: 'text-slate-600 bg-slate-50 border-slate-200' };
        }
    };

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'urgent': return <span className="px-2 py-0.5 rounded-[8px] text-[10px] font-black bg-red-100/80 text-red-600 border border-red-200 uppercase tracking-widest shadow-sm">Urgente</span>;
            case 'high': return <span className="px-2 py-0.5 rounded-[8px] text-[10px] font-bold bg-orange-100/80 text-orange-600 border border-orange-200 uppercase tracking-wider shadow-sm">Alta</span>;
            default: return null;
        }
    };

    // Grouping tasks
    const activeTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const overdueTasks = activeTasks.filter(t => t.dueDate && isOverdueExact(t.dueDate) && !isTodayInArgentina(t.dueDate));
    const todayTasks = activeTasks.filter(t => t.dueDate && isTodayInArgentina(t.dueDate));
    const upcomingTasks = activeTasks.filter(t => !t.dueDate || (!isOverdueExact(t.dueDate) && !isTodayInArgentina(t.dueDate)));

    // Kanban Grouping
    const pendingTasks = tasks.filter(t => t.status === 'pending').sort((a, b) => (new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime()));
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').sort((a, b) => (new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime()));
    const completedTasks = tasks.filter(t => t.status === 'completed').sort((a, b) => (new Date((b as any).completedAt || 0).getTime() - new Date((a as any).completedAt || 0).getTime()));


    const renderTaskCard = (task: TaskData, isOverdue: boolean, isKanbanCompleted: boolean = false) => (
        <div
            key={task._id}
            onClick={(e) => handleEdit(task, e)}
            className="group bg-white/60 backdrop-blur-xl rounded-[20px] p-5 border border-white/80 shadow-[0_4px_16px_rgba(30,27,75,0.02)] hover:shadow-[0_12px_32px_rgba(139,92,246,0.1)] hover:border-violet-300 hover:bg-white/80 transition-all duration-300 flex items-start gap-4 cursor-pointer relative overflow-hidden hover:-translate-y-1 w-full"
        >
            <div className={`absolute inset-y-0 left-0 w-1.5 transition-opacity duration-300 ${isOverdue ? 'bg-red-500 opacity-70 group-hover:opacity-100' : 'bg-gradient-to-b from-violet-500 to-fuchsia-500 opacity-0 group-hover:opacity-100'}`} />

            <button
                onClick={(e) => handleComplete(task._id, e)}
                className={`mt-1 transition-colors shrink-0 outline-none hover:scale-110 ${task.status === 'completed' || isKanbanCompleted ? 'text-emerald-500' : 'text-slate-300 group-hover:text-emerald-500'}`}
                title="Marcar completada"
                disabled={task.status === 'completed' || isKanbanCompleted}
            >
                {task.status === 'completed' || isKanbanCompleted ? (
                    <CheckCircle2 size={24} strokeWidth={2.5} className="drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)] text-emerald-500" />
                ) : (
                    <>
                        <Circle size={24} strokeWidth={2.5} className="group-hover:hidden" />
                        <CheckCircle2 size={24} strokeWidth={2.5} className="hidden group-hover:block drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)] text-emerald-500" />
                    </>
                )}
            </button>

            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                    <h3 className="font-bold text-slate-800 text-[16px] group-hover:text-violet-700 transition-colors truncate">{task.title}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                        {getPriorityBadge(task.priority)}
                        <span className={`px-2.5 py-1 rounded-[8px] text-[10px] font-bold border uppercase tracking-widest ${getTypeInfo(task.type).color} shadow-sm`}>
                            {getTypeInfo(task.type).label}
                        </span>
                        <OwnerAvatar name={task.assignedTo?.name} profilePhotoUrl={task.assignedTo?.profilePhotoUrl} size="xs" />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-bold text-slate-500 mt-3 pt-3 border-t border-slate-200/50">
                    {task.dueDate && (
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] shadow-sm ${isOverdue ? 'bg-red-50/90 text-red-600 border border-red-200' : 'bg-white/80 text-slate-600 border border-slate-200'}`}>
                            <Clock size={14} className={isOverdue ? 'text-red-500' : 'text-slate-400'} />
                            {formatToArgentineDateTime(task.dueDate)}
                        </span>
                    )}
                    {task.company && (
                        <span className="flex items-center gap-1.5 bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-[10px] border border-white shadow-sm"><Building2 size={14} className="text-blue-500" /> <span className="truncate max-w-[120px]">{task.company.name}</span></span>
                    )}
                    {task.contact && (
                        <span className="flex items-center gap-1.5 bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-[10px] border border-white shadow-sm"><Users size={14} className="text-emerald-500" /> <span className="truncate max-w-[120px]">{task.contact.fullName}</span></span>
                    )}
                    {task.deal && (
                        <span className="flex items-center gap-1.5 bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-[10px] border border-white shadow-sm"><Briefcase size={14} className="text-violet-500" /> <span className="truncate max-w-[120px]">{task.deal.title}</span></span>
                    )}
                </div>
            </div>
            {/* Grab handle hint */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-20 transition-opacity">
                <GripVertical size={20} className="text-slate-800" />
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4">
            {/* Atmospheric Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px] -z-10">
                <div className="absolute top-0 -right-20 w-[600px] h-[600px] bg-violet-400/20 rounded-full blur-3xl opacity-50 animate-[pulse_10s_ease-in-out_infinite]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-fuchsia-400/20 rounded-full blur-3xl opacity-40 animate-[pulse_12s_ease-in-out_infinite_reverse]" />
            </div>

            {/* Premium Header Reutilizable */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar tarea por título, empresa..."
                    onAdd={handleAdd}
                    addLabel="Nueva Tarea"
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                >
                    <div className="hidden md:flex bg-white/50 backdrop-blur-sm p-1 rounded-[12px] border border-white/60 shadow-inner mr-1">
                        <button
                            onClick={() => setViewMode('date')}
                            className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all duration-300 ${viewMode === 'date' ? 'bg-white shadow-sm text-violet-600 border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40 border border-transparent'}`}
                        >
                            Vista por Fecha
                        </button>
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all duration-300 ${viewMode === 'kanban' ? 'bg-white shadow-sm text-violet-600 border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40 border border-transparent'}`}
                        >
                            Vista Kanban
                        </button>
                    </div>
                </PremiumHeader>
            </div>

            {/* Task Board / List Area */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center bg-white/30 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                    <div className="relative">
                        <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl animate-pulse" />
                        <div className="animate-spin w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full relative z-10" />
                    </div>
                </div>
            ) : tasks.length === 0 && !search ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white/30 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)] opacity-80">
                    <div className="w-24 h-24 bg-emerald-50/80 rounded-[32px] flex items-center justify-center mb-6 border border-emerald-100/50 shadow-inner">
                        <CheckCircle2 size={40} className="text-emerald-500" />
                    </div>
                    <h3 className="text-[20px] font-black text-slate-700">¡Todo al día!</h3>
                    <p className="text-[15px] font-medium text-slate-500 mt-2">No tienes tareas pendientes generadas.</p>
                    <button onClick={handleAdd} className="mt-6 text-violet-600 font-bold hover:text-violet-700 hover:underline">Crear primera tarea</button>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
                    {viewMode === 'date' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                            {/* Column: Overdue */}
                            <div className="flex flex-col gap-4">
                                <h3 className="flex items-center gap-2 font-black text-[16px] text-slate-800 bg-white/40 backdrop-blur-md px-4 py-3 rounded-[16px] border border-white/60 shadow-sm">
                                    <AlertCircle size={18} className="text-red-500" />
                                    Vencidas
                                    <span className="ml-auto bg-red-100/80 text-red-600 px-2 py-0.5 rounded-[8px] text-[12px]">{overdueTasks.length}</span>
                                </h3>
                                <div className="flex flex-col gap-3">
                                    {overdueTasks.map(t => renderTaskCard(t, true))}
                                    {overdueTasks.length === 0 && (
                                        <div className="bg-white/30 backdrop-blur-sm border border-white/40 border-dashed rounded-[20px] h-32 flex items-center justify-center text-slate-400 font-medium text-[13px]">Sin tareas vencidas</div>
                                    )}
                                </div>
                            </div>

                            {/* Column: Today */}
                            <div className="flex flex-col gap-4">
                                <h3 className="flex items-center gap-2 font-black text-[16px] text-slate-800 bg-white/40 backdrop-blur-md px-4 py-3 rounded-[16px] border border-white/60 shadow-sm border-t-2 border-t-emerald-400">
                                    <CalendarIcon size={18} className="text-emerald-500" />
                                    Para Hoy
                                    <span className="ml-auto bg-emerald-100/80 text-emerald-600 px-2 py-0.5 rounded-[8px] text-[12px]">{todayTasks.length}</span>
                                </h3>
                                <div className="flex flex-col gap-3">
                                    {todayTasks.map(t => renderTaskCard(t, false))}
                                    {todayTasks.length === 0 && (
                                        <div className="bg-white/30 backdrop-blur-sm border border-white/40 border-dashed rounded-[20px] h-32 flex items-center justify-center text-slate-400 font-medium text-[13px]">Día libre</div>
                                    )}
                                </div>
                            </div>

                            {/* Column: Upcoming */}
                            <div className="flex flex-col gap-4">
                                <h3 className="flex items-center gap-2 font-black text-[16px] text-slate-800 bg-white/40 backdrop-blur-md px-4 py-3 rounded-[16px] border border-white/60 shadow-sm">
                                    <LayoutList size={18} className="text-blue-500" />
                                    Próximas
                                    <span className="ml-auto bg-blue-100/80 text-blue-600 px-2 py-0.5 rounded-[8px] text-[12px]">{upcomingTasks.length}</span>
                                </h3>
                                <div className="flex flex-col gap-3">
                                    {upcomingTasks.map(t => renderTaskCard(t, false))}
                                    {upcomingTasks.length === 0 && (
                                        <div className="bg-white/30 backdrop-blur-sm border border-white/40 border-dashed rounded-[20px] h-32 flex items-center justify-center text-slate-400 font-medium text-[13px]">Sin tareas futuras</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start h-full pb-10">
                                {/* Pending */}
                                <Droppable droppableId="pending">
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className={`flex flex-col gap-4 bg-slate-50/50 p-4 rounded-3xl min-h-[500px] border transition-colors ${snapshot.isDraggingOver ? 'border-violet-300 bg-violet-50/30' : 'border-transparent'}`}
                                        >
                                            <h3 className="flex items-center gap-2 font-black text-[16px] text-slate-800 bg-white/40 backdrop-blur-md px-4 py-3 rounded-[16px] border border-white/60 shadow-sm border-t-2 border-t-slate-400">
                                                <Circle size={18} className="text-slate-400" />
                                                Pendientes
                                                <span className="ml-auto bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-[8px] text-[12px]">{pendingTasks.length}</span>
                                            </h3>
                                            <div className="flex flex-col gap-3">
                                                {pendingTasks.map((t, index) => (
                                                    <Draggable key={t._id} draggableId={t._id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={{ ...provided.draggableProps.style }}
                                                                className={`transition-shadow ${snapshot.isDragging ? 'shadow-2xl scale-[1.02] z-50' : ''}`}
                                                            >
                                                                {renderTaskCard(t, t.isOverdue || false)}
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </Droppable>

                                {/* In Progress */}
                                <Droppable droppableId="in_progress">
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className={`flex flex-col gap-4 bg-blue-50/30 p-4 rounded-3xl min-h-[500px] border transition-colors ${snapshot.isDraggingOver ? 'border-blue-300 bg-blue-50/50' : 'border-transparent'}`}
                                        >
                                            <h3 className="flex items-center gap-2 font-black text-[16px] text-slate-800 bg-white/40 backdrop-blur-md px-4 py-3 rounded-[16px] border border-white/60 shadow-sm border-t-2 border-t-blue-400">
                                                <Clock size={18} className="text-blue-500" />
                                                En Progreso
                                                <span className="ml-auto bg-blue-100/80 text-blue-600 px-2 py-0.5 rounded-[8px] text-[12px]">{inProgressTasks.length}</span>
                                            </h3>
                                            <div className="flex flex-col gap-3">
                                                {inProgressTasks.map((t, index) => (
                                                    <Draggable key={t._id} draggableId={t._id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={{ ...provided.draggableProps.style }}
                                                                className={`transition-shadow ${snapshot.isDragging ? 'shadow-2xl scale-[1.02] z-50' : ''}`}
                                                            >
                                                                {renderTaskCard(t, false)}
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </Droppable>

                                {/* Completed */}
                                <Droppable droppableId="completed">
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className={`flex flex-col gap-4 bg-emerald-50/30 p-4 rounded-3xl min-h-[500px] border transition-colors ${snapshot.isDraggingOver ? 'border-emerald-300 bg-emerald-50/50' : 'border-transparent'}`}
                                        >
                                            <h3 className="flex items-center gap-2 font-black text-[16px] text-slate-800 bg-white/40 backdrop-blur-md px-4 py-3 rounded-[16px] border border-white/60 shadow-sm border-t-2 border-t-emerald-400">
                                                <CheckCircle2 size={18} className="text-emerald-500" />
                                                Completadas
                                                <span className="ml-auto bg-emerald-100/80 text-emerald-600 px-2 py-0.5 rounded-[8px] text-[12px]">{completedTasks.length}</span>
                                            </h3>
                                            <div className="flex flex-col gap-3 opacity-70 hover:opacity-100 transition-opacity">
                                                {completedTasks.map((t, index) => (
                                                    <Draggable key={t._id} draggableId={t._id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={{ ...provided.draggableProps.style }}
                                                                className={`transition-shadow ${snapshot.isDragging ? 'shadow-2xl scale-[1.02] z-50' : ''}`}
                                                            >
                                                                {renderTaskCard(t, false, true)}
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </Droppable>
                            </div>
                        </DragDropContext>
                    )}
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.4); }
            `}</style>

            <TaskFormDrawer
                open={isDrawerOpen}
                task={editingTask}
                onClose={() => setIsDrawerOpen(false)}
                onSaved={loadData}
            />
        </div>
    );
}
