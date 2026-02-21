import React from 'react';

interface OwnerAvatarProps {
    name?: string;
    profilePhotoUrl?: string;
    size?: 'xs' | 'sm' | 'md';
    showName?: boolean;
    className?: string;
}

const SIZES = {
    xs: { container: 'w-5 h-5', text: 'text-[7px]', nameText: 'text-[10px]' },
    sm: { container: 'w-6 h-6', text: 'text-[8px]', nameText: 'text-[11px]' },
    md: { container: 'w-8 h-8', text: 'text-[10px]', nameText: 'text-[12px]' },
};

const COLORS = [
    'from-violet-400 to-fuchsia-400',
    'from-blue-400 to-indigo-400',
    'from-emerald-400 to-teal-400',
    'from-orange-400 to-amber-400',
    'from-pink-400 to-rose-400',
    'from-cyan-400 to-sky-400',
];

function getColorFromName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

export default function OwnerAvatar({ name, profilePhotoUrl, size = 'sm', showName = false, className = '' }: OwnerAvatarProps) {
    if (!name && !profilePhotoUrl) return null;

    const s = SIZES[size];
    const displayName = name || '??';
    const gradient = getColorFromName(displayName);

    return (
        <div className={`flex items-center gap-1.5 ${className}`} title={displayName}>
            {profilePhotoUrl ? (
                <img
                    src={profilePhotoUrl}
                    alt={displayName}
                    className={`${s.container} rounded-full object-cover ring-1 ring-white shadow-sm shrink-0`}
                />
            ) : (
                <div className={`${s.container} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center ring-1 ring-white shadow-sm shrink-0`}>
                    <span className={`${s.text} font-bold text-white leading-none`}>
                        {getInitials(displayName)}
                    </span>
                </div>
            )}
            {showName && (
                <span className={`${s.nameText} font-medium text-slate-600 truncate max-w-[100px]`}>
                    {displayName}
                </span>
            )}
        </div>
    );
}
