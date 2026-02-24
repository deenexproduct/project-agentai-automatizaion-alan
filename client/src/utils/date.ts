/**
 * Utilidad centralizada para formateo de fechas
 * Garantiza que todas las fechas de la aplicación se muestren en el huso horario de Argentina
 * (America/Argentina/Buenos_Aires / GMT-3) independientemente de la configuración local del sistema del usuario.
 */

export function parseSafeDate(dateInput: string | Date | undefined | null): Date {
    if (!dateInput) throw new Error('Invalid date');
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) throw new Error('Invalid date');

    // Mongoose/JS parses pure dates (YYYY-MM-DD) as UTC midnight.
    // In Argentina (UTC-3), UTC midnight becomes 21:00 of the PREVIOUS day.
    // This detects midnight UTC strings or pure date strings and forces them to local noon.
    if (typeof dateInput === 'string' && dateInput.endsWith('T00:00:00.000Z')) {
        const parts = dateInput.split('T')[0].split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        }
    }

    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        const parts = dateInput.split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    }

    return date;
}

/**
 * Devuelve un string 'YYYY-MM-DD' de la fecha proporcionada respetando la zona horaria de Argentina.
 * Evita el uso problemático de `toISOString().split('T')[0]` que usa UTC.
 */
export function formatToLocalDateInput(dateInput: string | Date | undefined | null = new Date()): string {
    if (!dateInput) return '';
    try {
        const date = parseSafeDate(dateInput);
        const options: Intl.DateTimeFormatOptions = {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };
        const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date); // en-CA gives YYYY-MM-DD
        const y = parts.find(p => p.type === 'year')?.value;
        const m = parts.find(p => p.type === 'month')?.value;
        const d = parts.find(p => p.type === 'day')?.value;
        return `${y}-${m}-${d}`;
    } catch (e) {
        return '';
    }
}

/**
 * Devuelve un string 'YYYY-MM-DDTHH:mm' respetando la zona horaria de Argentina.
 * Ideal para inputs type="datetime-local"
 */
export function formatToLocalDateTimeInput(dateInput: string | Date | undefined | null = new Date()): string {
    if (!dateInput) return '';
    try {
        const date = parseSafeDate(dateInput);
        const options: Intl.DateTimeFormatOptions = {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
        const y = parts.find(p => p.type === 'year')?.value;
        const m = parts.find(p => p.type === 'month')?.value;
        const d = parts.find(p => p.type === 'day')?.value;
        const h = parts.find(p => p.type === 'hour')?.value;
        const min = parts.find(p => p.type === 'minute')?.value;
        return `${y}-${m}-${d}T${h}:${min}`;
    } catch (e) {
        return '';
    }
}

// Format: 21 feb, 2026
export function formatToArgentineDate(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return 'Sin fecha';
    try {
        const date = parseSafeDate(dateInput);
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
        const date = parseSafeDate(dateInput);
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
        const date = parseSafeDate(dateInput);
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
        const date = parseSafeDate(dateInput);
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
        const date = parseSafeDate(dateInput);
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
        const date = new Date(dateInput); // Retain exactly as timestamp for strict overdue checking, no timezone shift matters for pure timestamp
        if (isNaN(date.getTime())) return false;
        return date.getTime() < new Date().getTime();
    } catch (e) {
        return false;
    }
}
