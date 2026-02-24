import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/axios';
import { Users, Mail, UserPlus, Shield, Clock, Search, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TeamMember {
    _id: string;
    email: string;
    name?: string;
    role: 'admin' | 'user';
    createdAt: string;
}

export default function TeamPermissions() {
    const { user } = useAuth();

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        loadMembers();
    }, []);

    const loadMembers = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/auth/users');
            setMembers(res.data);
        } catch (error) {
            console.error('Failed to load team members:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;

        setIsInviting(true);
        setInviteMessage(null);

        try {
            const res = await api.post('/auth/invite', { email: inviteEmail, name: inviteName });
            setInviteMessage({ type: 'success', text: res.data.message || 'Invitación enviada con éxito.' });
            setInviteEmail('');
            setInviteName('');
            loadMembers(); // Refresh list
        } catch (error: any) {
            setInviteMessage({
                type: 'error',
                text: error.response?.data?.error || 'Falló el envío de la invitación.'
            });
        } finally {
            setIsInviting(false);
        }
    };



    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 py-4 md:py-6 pb-24 md:pb-6">

            {/* Left Column: Team List */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">Miembros del Equipo</h3>
                                <p className="text-sm text-slate-500">{members.length} usuarios registrados en la plataforma</p>
                            </div>
                        </div>
                        <div className="relative w-full md:w-auto">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar usuario..."
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-full md:w-64 transition-all"
                            />
                        </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {isLoading ? (
                            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                Cargando usuarios...
                            </div>
                        ) : members.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">
                                No hay usuarios en el equipo aún.
                            </div>
                        ) : (
                            members.map((member) => (
                                <div key={member._id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between group gap-3">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-100 to-violet-100 flex items-center justify-center shadow-inner border border-white">
                                            <span className="text-indigo-700 font-bold text-lg">
                                                {member.name ? member.name.charAt(0).toUpperCase() : member.email.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-800">{member.name || 'Usuario Invitado'}</p>
                                            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                <Mail className="w-3.5 h-3.5" />
                                                {member.email}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <div className="flex items-center justify-end gap-1.5 mb-1">
                                                {member.role === 'admin' ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                                        <Shield className="w-3 h-3" /> Admin
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                                        <Users className="w-3 h-3" /> User
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 flex items-center justify-end gap-1">
                                                <Clock className="w-3 h-3" />
                                                Registrado el {new Date(member.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>

                                        <button className="md:opacity-0 md:group-hover:opacity-100 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Eliminar Acceso">
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Right Column: Invite Form */}
            <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
                        <UserPlus className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Añadir Nuevo Miembro</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                        Envía una invitación por correo. Los usuarios nuevos no tienen que crear contraseña, accederán con un código temporal (OTP) enviado a su email.
                    </p>

                    {inviteMessage && (
                        <div className={`p-4 rounded-xl mb-6 text-sm flex items-start gap-3 border ${inviteMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                            {inviteMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                            <p className="pt-0.5 leading-tight">{inviteMessage.text}</p>
                        </div>
                    )}

                    <form onSubmit={handleInvite} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Completo</label>
                            <input
                                type="text"
                                value={inviteName}
                                onChange={e => setInviteName(e.target.value)}
                                placeholder="Ej: Maria Gonzalez"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Correo Electrónico *</label>
                            <input
                                type="email"
                                required
                                value={inviteEmail}
                                onChange={e => setInviteEmail(e.target.value)}
                                placeholder="maria@empresa.com"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-900"
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isInviting || !inviteEmail}
                                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/30 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isInviting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Enviando Invtiación...
                                    </>
                                ) : (
                                    <>
                                        Enviar Invitación
                                        <Mail className="w-4 h-4 ml-1" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
