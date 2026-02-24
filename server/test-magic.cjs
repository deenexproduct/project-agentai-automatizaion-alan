const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    date: Date,
});
const Event = mongoose.model('FakeEvent3', EventSchema);

async function testService(event) {
    console.log("Inside service, date type:", typeof event.date, Object.prototype.toString.call(event.date));
    
    // Will split crash?
    try {
        console.log("Split attempt:", event.date.split('T')[0]);
    } catch (e) {
        console.log("Crash:", e.message);
    }
}

async function run() {
    const newEvent = new Event({ date: "2026-02-25" });
    const obj = newEvent.toObject();
    await testService(obj);
}

run();
