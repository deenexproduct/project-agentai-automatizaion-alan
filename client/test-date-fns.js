const { isSameDay, startOfMonth, startOfWeek, endOfMonth, endOfWeek, eachDayOfInterval } = require('date-fns');

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

const currentDate = new Date('2026-03-01T12:00:00.000Z');
const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
});

const eventDateInput1 = "2026-03-01T00:00:00.000Z";
const eventDateInput2 = "2026-02-28T00:00:00.000Z";
const eventDateInput3 = "2026-02-25T00:00:00.000Z";

for (const input of [eventDateInput1, eventDateInput2, eventDateInput3]) {
    const eventDate = parseSafeDate(input);
    const match = days.find(d => isSameDay(eventDate, d));
    console.log(`Input: ${input} parsed back to ${eventDate.toISOString().padEnd(25)} -> Matches day: ${match ? match.toISOString() : 'NULL'}`);
}
