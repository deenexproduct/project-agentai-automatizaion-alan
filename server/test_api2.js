const mongoose = require('mongoose');
require('dotenv').config();

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;

        // Find a user who is NOT the owner
        const ownerConfig = await db.collection('calendarconfigs').findOne({ googleRefreshToken: { $ne: null } });
        if (!ownerConfig) {
            console.log("No config at all");
            process.exit(0);
        }
        const ownerId = ownerConfig.userId;

        const otherUser = await db.collection('users').findOne({ _id: { $ne: ownerId } });
        console.log("Testing as user:", otherUser ? otherUser.email : "NO OTHER USER");

        if (!otherUser) process.exit(0);

        const userId = otherUser._id.toString();
        const userConfig = await db.collection('calendarconfigs').findOne({ userId: otherUser._id });
        const googleConfig = await db.collection('calendarconfigs').findOne({ googleRefreshToken: { $ne: null } });

        const responseData = {
            ...(userConfig || {}),
            isGoogleOwner: googleConfig ? googleConfig.userId.toString() === userId : false,
            googleRefreshToken: googleConfig?.googleRefreshToken,
            googleEmail: googleConfig?.googleEmail,
            googleCalendarId: googleConfig?.googleCalendarId,
        };
        console.log("Response would be:");
        console.dir(responseData, { depth: null });
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
test();
