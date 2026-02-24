const { startOfWeek, startOfMonth, endOfWeek, endOfMonth } = require('date-fns');

const currentDate = new Date(2026, 2, 1, 12, 0, 0); // March 1, 2026 (local noon)

const start = startOfWeek(startOfMonth(currentDate));
const end = endOfWeek(endOfMonth(currentDate));

console.log("start:", start.toISOString()); // Expected around ~Feb 23
console.log("end:", end.toISOString());     // Expected around ~April 5

// Simulate backend boundary filtering
const qStart = new Date(start.toISOString());
const qEnd = new Date(end.toISOString());
console.log("\nBackend parsed query bounds:");
console.log("qStart:", qStart.toISOString());
console.log("qEnd:", qEnd.toISOString());

const targetEvent = new Date("2026-03-01T00:00:00.000Z"); // March 1st midnight UTC in DB
console.log("\nIs target in bounds? :", targetEvent >= qStart && targetEvent <= qEnd);

// What if the user is looking at FEBRUARY grid?
const febDate = new Date(2026, 1, 1, 12, 0, 0);
const fStart = startOfWeek(startOfMonth(febDate));
const fEnd = endOfWeek(endOfMonth(febDate));
const fqStart = new Date(fStart.toISOString());
const fqEnd = new Date(fEnd.toISOString());
console.log("\nIf on Feb grid...");
console.log("fEnd:", fqEnd.toISOString());
console.log("Is March 1st inside Feb grid bounds?", targetEvent >= fqStart && targetEvent <= fqEnd);

