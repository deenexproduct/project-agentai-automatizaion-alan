/**
 * Utilidad centralizada para formateo de fechas
 * Garantiza que todas las fechas de la aplicación se muestren en el huso horario de Argentina
 * (America/Argentina/Buenos_Aires / GMT-3) independientemente de la configuración local del sistema del usuario.
 */

// Format: 21 feb, 2026
export function formatToArgentineDate(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return 'Sin fecha';

    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return 'Fecha inválida';

        return new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).format(date);
    } catch (e) {
        return 'Fecha inválida';
    }
}

// Format: 21 feb, 16:30
export function formatToArgentineDateTime(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return 'Sin fecha';

    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return 'Fecha inválida';

        return new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    } catch (e) {
        return 'Fecha inválida';
    }
}

// Format: 16:30
export function formatToArgentineTimeOnly(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return '--:--';

    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return '--:--';

        return new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    } catch (e) {
        return '--:--';
    }
}

// Format: 21 de Febrero de 2026
export function formatToArgentineLongDate(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return 'Sin fecha';

    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return 'Fecha inválida';

        return new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(date);
    } catch (e) {
        return 'Fecha inválida';
    }
}

// Devuelve true si la fecha dada es "hoy" bajo el horario de Argentina
export function isTodayInArgentina(dateInput: string | Date | undefined | null): boolean {
    if (!dateInput) return false;
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return false;

        const formatOpts: Intl.DateTimeFormatOptions = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: 'numeric', day: 'numeric' };
        const todayStr = new Intl.DateTimeFormat('es-AR', formatOpts).format(new Date());
        const inputStr = new Intl.DateTimeFormat('es-AR', formatOpts).format(date);

        return todayStr === inputStr;
    } catch (e) {
        return false;
    }
}

// Devuelve true si la fecha dada ya pasó respecto al momento exacto actual (timestamp)
// (Safe timezone-independiente ya que compara timestamps absolutos)
export function isOverdueExact(dateInput: string | Date | undefined | null): boolean {
    if (!dateInput) return false;
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return false;
        return date.getTime() < new Date().getTime();
    } catch (e) {
        return false;
    }
}
