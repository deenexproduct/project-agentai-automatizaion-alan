import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/axios';
import { Users, Mail, UserPlus, Shield, Clock, Search, AlertCircle, CheckCircle2, Monitor, Settings } from 'lucide-react';

interface TeamMember {
    _id: string;
    email: string;
    name?: string;
    role: 'admin' | 'user';
    platforms?: ('comercial' | 'operaciones')[];
    createdAt: string;
}

const PLATFORM_CONFIG = {
    comercial: { label: 'Comercial', emoji: '💼', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
    operaciones: { label: 'Operaciones', emoji: '⚙️', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)' },
};

export default function TeamPermissions() {
    const { user } = useAuth();

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [invitePlatforms, setInvitePlatforms] = useState<string[]>(['comercial']);
    const [isInviting, setIsInviting] = useState(false);
    const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [updatingUser, setUpdatingUser] = useState<string | null>(null);

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
            const res = await api.post('/auth/invite', {
                email: inviteEmail,
                name: inviteName,
                platforms: invitePlatforms,
            });
            setInviteMessage({ type: 'success', text: res.data.message || 'Invitación enviada con éxito.' });
            setInviteEmail('');
            setInviteName('');
            setInvitePlatforms(['comercial']);
            loadMembers();
        } catch (error: any) {
            setInviteMessage({
                type: 'error',
                text: error.response?.data?.error || 'Falló el envío de la invitación.'
            });
        } finally {
            setIsInviting(false);
        }
    };

    const togglePlatform = async (memberId: string, platform: 'comercial' | 'operaciones', currentPlatforms: string[]) => {
        const hasIt = currentPlatforms.includes(platform);
        let newPlatforms: string[];

        if (hasIt) {
            // Don't allow removing the last platform
            if (currentPlatforms.length <= 1) return;
            newPlatforms = currentPlatforms.filter(p => p !== platform);
        } else {
            newPlatforms = [...currentPlatforms, platform];
        }

        setUpdatingUser(memberId);
        try {
            await api.put(`/auth/users/${memberId}/platforms`, { platforms: newPlatforms });
            setMembers(prev => prev.map(m =>
                m._id === memberId ? { ...m, platforms: newPlatforms as any } : m
            ));
        } catch (error) {
            console.error('Failed to update platforms:', error);
        } finally {
            setUpdatingUser(null);
        }
    };

    const toggleRole = async (memberId: string, currentRole: 'admin' | 'user') => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        setUpdatingUser(memberId);
        try {
            await api.put(`/auth/users/${memberId}/role`, { role: newRole });
            setMembers(prev => prev.map(m =>
                m._id === memberId ? { ...m, role: newRole } : m
            ));
        } catch (error) {
            console.error('Failed to update role:', error);
        } finally {
            setUpdatingUser(null);
        }
    };

    const toggleInvitePlatform = (platform: string) => {
        setInvitePlatforms(prev => {
            if (prev.includes(platform)) {
                if (prev.length <= 1) return prev; // Keep at least one
                return prev.filter(p => p !== platform);
            }
            return [...prev, platform];
        });
    };

    const filteredMembers = members.filter(m => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (m.name?.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    });

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
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
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
                        ) : filteredMembers.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">
                                No hay usuarios en el equipo aún.
                            </div>
                        ) : (
                            filteredMembers.map((member) => {
                                const memberPlatforms = member.platforms || ['comercial'];
                                const isUpdating = updatingUser === member._id;

                                return (
                                    <div key={member._id} className="p-4 hover:bg-slate-50 transition-colors group">
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
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

                                            <div className="flex items-center gap-3">
                                                {/* Role badge — clickable to toggle */}
                                                <button
                                                    onClick={() => toggleRole(member._id, member.role)}
                                                    disabled={isUpdating || member._id === user?._id}
                                                    className="transition-all duration-200 hover:scale-105"
                                                    style={{ cursor: member._id === user?._id ? 'default' : 'pointer', opacity: isUpdating ? 0.5 : 1 }}
                                                    title={member._id === user?._id ? 'No podés cambiar tu propio rol' : `Cambiar a ${member.role === 'admin' ? 'User' : 'Admin'}`}
                                                >
                                                    {member.role === 'admin' ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                                            <Shield className="w-3 h-3" /> Admin
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                                            <Users className="w-3 h-3" /> User
                                                        </span>
                                                    )}
                                                </button>

                                                {/* Platform toggles */}
                                                <div className="flex items-center gap-1.5">
                                                    {(Object.keys(PLATFORM_CONFIG) as ('comercial' | 'operaciones')[]).map((platform) => {
                                                        const cfg = PLATFORM_CONFIG[platform];
                                                        const active = memberPlatforms.includes(platform);
                                                        const isOnly = memberPlatforms.length === 1 && active;

                                                        return (
                                                            <button
                                                                key={platform}
                                                                onClick={() => !isOnly && togglePlatform(member._id, platform, memberPlatforms)}
                                                                disabled={isUpdating}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200"
                                                                style={{
                                                                    background: active ? cfg.bg : 'transparent',
                                                                    color: active ? cfg.color : '#94a3b8',
                                                                    border: `1px solid ${active ? cfg.color + '40' : '#e2e8f0'}`,
                                                                    opacity: isUpdating ? 0.5 : (isOnly ? 0.7 : 1),
                                                                    cursor: isOnly ? 'default' : 'pointer',
                                                                }}
                                                                title={`${active ? 'Quitar' : 'Agregar'} acceso a ${cfg.label}${isOnly ? ' (mínimo 1 plataforma)' : ''}`}
                                                            >
                                                                <span>{cfg.emoji}</span>
                                                                <span>{cfg.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
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
                        Envía una invitación por correo. Los usuarios nuevos accederán con un código temporal (OTP) enviado a su email.
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

                        {/* Platform Access Selection */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Acceso a Plataformas</label>
                            <div className="flex gap-2">
                                {(Object.keys(PLATFORM_CONFIG) as ('comercial' | 'operaciones')[]).map((platform) => {
                                    const cfg = PLATFORM_CONFIG[platform];
                                    const active = invitePlatforms.includes(platform);
                                    const isOnly = invitePlatforms.length === 1 && active;

                                    return (
                                        <button
                                            key={platform}
                                            type="button"
                                            onClick={() => !isOnly && toggleInvitePlatform(platform)}
                                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                                            style={{
                                                background: active ? cfg.bg : '#f8fafc',
                                                color: active ? cfg.color : '#94a3b8',
                                                border: `2px solid ${active ? cfg.color : '#e2e8f0'}`,
                                                cursor: isOnly ? 'default' : 'pointer',
                                            }}
                                        >
                                            <span>{cfg.emoji}</span>
                                            <span>{cfg.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
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
                                        Enviando Invitación...
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
