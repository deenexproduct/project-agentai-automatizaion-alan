import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Header platform switcher — shows current platform badge and toggle
 * for users with access to both Comercial and Operaciones.
 */
export default function PlatformSwitcher({ current }: { current: 'comercial' | 'operaciones' }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [hovered, setHovered] = useState(false);

    const platforms = user?.platforms || ['comercial'];
    const hasBoth = platforms.includes('comercial') && platforms.includes('operaciones');

    const config = {
        comercial: { label: 'Comercial', emoji: '💼', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', route: '/linkedin/dashboard' },
        operaciones: { label: 'Operaciones', emoji: '⚙️', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.12)', route: '/ops/dashboard' },
    };

    const currentCfg = config[current];
    const otherKey = current === 'comercial' ? 'operaciones' : 'comercial';
    const otherCfg = config[otherKey];

    const handleSwitch = () => {
        navigate(otherCfg.route);
    };

    if (!hasBoth) {
        // Single platform — just show a label
        return (
            <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: currentCfg.bg, color: currentCfg.color }}
            >
                <span>{currentCfg.emoji}</span>
                <span>{currentCfg.label}</span>
            </div>
        );
    }

    // Both platforms — show switch toggle
    return (
        <button
            onClick={handleSwitch}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="flex items-center gap-0 rounded-xl overflow-hidden text-xs font-semibold transition-all duration-200"
            style={{
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: hovered ? '0 2px 12px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
                transform: hovered ? 'scale(1.03)' : 'scale(1)',
                cursor: 'pointer',
            }}
        >
            {/* Current platform (active) */}
            <div
                className="flex items-center gap-1.5 px-3 py-1.5 transition-all duration-200"
                style={{ background: currentCfg.bg, color: currentCfg.color }}
            >
                <span>{currentCfg.emoji}</span>
                <span>{currentCfg.label}</span>
            </div>
            {/* Other platform (inactive, clickable) */}
            <div
                className="flex items-center gap-1.5 px-3 py-1.5 transition-all duration-200"
                style={{
                    background: hovered ? otherCfg.bg : 'rgba(248, 250, 252, 1)',
                    color: hovered ? otherCfg.color : '#94a3b8',
                }}
            >
                <span style={{ opacity: hovered ? 1 : 0.5 }}>{otherCfg.emoji}</span>
                <span>{otherCfg.label}</span>
            </div>
        </button>
    );
}
