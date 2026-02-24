import React, { useState, useEffect } from 'react';
import { Loader2, Save, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function ProfileSettings() {
    const { user, updateProfile } = useAuth();
    const [name, setName] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Sync from user when it loads
    useEffect(() => {
        if (user) {
            setName(user.name || '');
            setPhotoUrl(user.profilePhotoUrl || '');
        }
    }, [user]);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        const success = await updateProfile({ name: name.trim(), profilePhotoUrl: photoUrl.trim() || undefined });
        setSaving(false);
        if (success) {
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        }
    };

    const initials = name
        ? name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase()
        : (user?.email?.substring(0, 2).toUpperCase() || '??');

    return (
        <div className="flex-1 flex items-start justify-center p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
            <div className="w-full max-w-md space-y-8">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-2xl font-black text-slate-800">Mi Perfil</h1>
                    <p className="text-sm text-slate-500 mt-1">Configurá tu nombre y foto para que tu equipo te identifique</p>
                </div>

                {/* Avatar Preview */}
                <div className="flex flex-col items-center gap-3">
                    {photoUrl ? (
                        <img
                            src={photoUrl}
                            alt="Mi foto"
                            className="w-24 h-24 rounded-2xl object-cover border-2 border-white shadow-xl ring-2 ring-fuchsia-200"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-400 to-fuchsia-400 flex items-center justify-center border-2 border-white shadow-xl ring-2 ring-fuchsia-200">
                            <span className="text-2xl font-black text-white">{initials}</span>
                        </div>
                    )}
                    <p className="text-xs text-slate-400">Pegá una URL de imagen abajo para tu foto de perfil</p>
                </div>

                {/* Name Field */}
                <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                        <User size={14} className="text-fuchsia-500" />
                        Nombre Completo
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ej. Alan Tapia"
                        className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[15px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                    />
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">
                        Email
                    </label>
                    <div className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-[14px] text-[15px] font-medium text-slate-600">
                        {user?.email || '—'}
                    </div>
                </div>

                {/* Photo URL */}
                <div className="space-y-2">
                    <label className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">
                        URL de Foto de Perfil
                    </label>
                    <input
                        type="url"
                        value={photoUrl}
                        onChange={(e) => setPhotoUrl(e.target.value)}
                        placeholder="https://ejemplo.com/mi-foto.jpg"
                        className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                    />
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    className="w-full py-3.5 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white rounded-[14px] text-[14px] font-bold hover:shadow-[0_8px_24px_rgba(217,70,239,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(217,70,239,0.3)]"
                >
                    {saving ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : saved ? (
                        <>✓ Guardado</>
                    ) : (
                        <><Save size={16} /> Guardar Perfil</>
                    )}
                </button>
            </div>
        </div>
    );
}
