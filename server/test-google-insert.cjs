
const eventDateInput = "2026-02-25";
const eventTimeInput = "09:00";

// This is exactly what createGoogleEvent does:
const eventDate = eventDateInput.split('T')[0];
const startDateTime = `${eventDate}T${eventTimeInput}:00`;
const endDateTime = `${eventDate}T10:00:00`;

const eventBody = {
    summary: "Reunión de Prueba",
    start: {
        dateTime: startDateTime,
        timeZone: 'America/Argentina/Buenos_Aires',
    },
    end: {
        dateTime: endDateTime,
        timeZone: 'America/Argentina/Buenos_Aires',
    }
};

console.log("Payload sent to Google:");
console.log(JSON.stringify(eventBody, null, 2));

// What does Google interpret this as?
// Google takes dateTime + timeZone and converts it internally.
// "2026-02-25T09:00:00" in Argentina (-03:00) means UTC "2026-02-25T12:00:00.000Z".
const dt = new Date("2026-02-25T09:00:00-03:00");
console.log("\nParsed time by JS engine (matches Google's UTC math):");
console.log("UTC Time:", dt.toISOString());
console.log("If this is UTC 12:00:00, then locally in Argentina it is Feb 25 09:00.");

