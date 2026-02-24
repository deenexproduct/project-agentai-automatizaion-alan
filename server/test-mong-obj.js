const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    date: Date,
});
const Event = mongoose.model('FakeEvent2', EventSchema);

const newEvent = new Event({ date: "2026-02-25" });
const obj = newEvent.toObject();
console.log("Type of date:", Object.prototype.toString.call(obj.date));
console.log("Is Date?", obj.date instanceof Date);
console.log("Stringification:", JSON.stringify(obj));

// If we pass it through JSON.stringify and JSON.parse...
const parsed = JSON.parse(JSON.stringify(obj));
console.log("Parsed type:", typeof parsed.date);
console.log("Parsed value:", parsed.date);
