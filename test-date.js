const assert = require('assert');

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

const input1 = "2026-02-26T00:00:00.000Z";
console.log(input1, "=>", parseSafeDate(input1));

const input2 = "2026-02-26";
console.log(input2, "=>", parseSafeDate(input2));

console.log("Local time offset:", new Date().getTimezoneOffset());
