const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    date: { type: Date, required: true },
});
const Event = mongoose.model('FakeEvent', EventSchema);

const e1 = new Event({ date: "2026-03-01" });
console.log("Input: 2026-03-01");
console.log("Mongoose Date:", e1.date.toISOString());

const e2 = new Event({ date: "2026-03-01T00:00:00.000Z" });
console.log("Input: 2026-03-01T00:00:00.000Z");
console.log("Mongoose Date:", e2.date.toISOString());

