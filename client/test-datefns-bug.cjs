const { isSameDay, startOfWeek, startOfMonth, startOfWeekWithOptions } = require('date-fns');

const event1 = new Date(2026, 1, 28, 12, 0, 0); // Feb 28
const event2 = new Date(2026, 2, 1, 12, 0, 0); // March 1st

const target1 = new Date(2026, 1, 28, 0, 0, 0);
const target2 = new Date(2026, 2, 1, 0, 0, 0);

console.log("isSameDay Feb 28:", isSameDay(event1, target1));
console.log("isSameDay Mar 01:", isSameDay(event2, target2));

