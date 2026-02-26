const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const configs = await db.collection('calendarconfigs').find({}).toArray();
        console.log("Total configs:", configs.length);
        const authConfigs = configs.filter(c => c.googleRefreshToken);
        console.log("Configs with googleRefreshToken:", authConfigs.length);
        if (authConfigs.length > 0) {
            console.log("Sample token:", authConfigs[0].googleRefreshToken.substring(0, 10) + "...");
            console.log("UserId of owner:", authConfigs[0].userId);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
check();
