const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    date: Date,
    startTime: String,
});
const Event = mongoose.model('TestEventGC', EventSchema);

const newEvent = new Event({
    date: "2026-02-25",
    startTime: "09:00"
});

const eventObj = newEvent.toObject();
console.log("eventObj.date type:", typeof eventObj.date);
console.log("eventObj.date value:", eventObj.date);
console.log("toISOString:", eventObj.date.toISOString());

// Simulating google-calendar.service.ts line 71:
// Wait, google-calendar.service.ts says: `const eventDate = event.date.split('T')[0];`
// If it's a Date object, .split() crashes. Let's see if it crashes.
try {
    const eventDateCrash = eventObj.date.split('T')[0];
    console.log("split worked!");
} catch (e) {
    console.log("split() crashed:", e.message);
}

// But wait, the user's stack trace showed creation succeeded! 
// Oh, the stack trace shows the response:
/*
{
    "success": true,
    "event": {
        "date": "2026-02-25T00:00:00.000Z",
        "googleEventId": "ogom0h9j4572c2t3foentj9s7c"
     }
}
*/
// It created the google event. How did `split` not crash if it's a Date?
// Maybe `event.date` is a string in the payload?
// If the payload from req.body is passed directly into `createGoogleEvent(..., req.body)`?
// No, it does `createGoogleEvent(config, newEvent.toObject());`
// But Mongoose `toObject()` behavior: if we have { getters: true }, sometimes it returns strings?
// Let's test checking if there's any scenario where split works or doesn't crash.

