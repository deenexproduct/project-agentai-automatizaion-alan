
function parseSafeDate(dateInput) {
    if (!dateInput) throw new Error('Invalid date');
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) throw new Error('Invalid date');

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

const dates = [
    "2026-02-28",
    "2026-02-28T00:00:00.000Z",
    "2026-03-01",
    "2026-03-01T00:00:00.000Z",
    "2026-03-02T00:00:00.000Z",
];

console.log("Timezone Offset:", new Date().getTimezoneOffset());
for (const d of dates) {
    const o = parseSafeDate(d);
    console.log(`Input: ${d.padEnd(25)} => Local ISO: ${o.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);
}

