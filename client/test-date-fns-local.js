const { isSameDay, eachDayOfInterval, startOfWeek, startOfMonth, endOfWeek, endOfMonth } = require('date-fns');

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

// Emulate client generating days
const currentDate = new Date('2026-03-01T12:00:00.000Z');
const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
});

const feb28 = "2026-02-28T00:00:00.000Z";
const mar01 = "2026-03-01T00:00:00.000Z";

console.log("Days generated around Feb/March transition:");
for (let i = 20; i < 28; i++) {
  console.log(`Day[${i}]: ${days[i].toString()}`);
}

const parsedFeb28 = parseSafeDate(feb28);
const parsedMar01 = parseSafeDate(mar01);

console.log("\nParsing result:");
console.log("feb28:", parsedFeb28.toString());
console.log("mar01:", parsedMar01.toString());

console.log("\nisSameDay checks:");
console.log("Matches Feb 28:", days.some(d => isSameDay(parsedFeb28, d)) ? "YES" : "NO");
console.log("Matches Mar 01:", days.some(d => isSameDay(parsedMar01, d)) ? "YES" : "NO");

const matchMar01 = days.find(d => isSameDay(parsedMar01, d));
if (matchMar01) {
  console.log("Mar 01 matched with day:", matchMar01.toString());
} else {
  console.log("Mar 01 did not match any day in the grid!");
  // Let's find what day it matched manually by matching dates
  const manualMatch = days.find(d => d.getDate() === parsedMar01.getDate() && d.getMonth() === parsedMar01.getMonth());
  console.log("It SHOULD have matched:", manualMatch.toString());
  console.log("Why not? parsedMar01.getDate() =", parsedMar01.getDate(), "manualMatch.getDate() =", manualMatch.getDate());
  console.log("parsedMar01.getFullYear() =", parsedMar01.getFullYear(), "manualMatch.getFullYear() =", manualMatch.getFullYear());
}
