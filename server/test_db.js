require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;

        const tasks = await db.collection('crm_tasks').find({}).limit(5).toArray();
        console.log("=== TASKS ===");
        tasks.forEach(t => console.log(Math.random(), t._id, t.title, "assignedTo:", t.assignedTo, "\n"));

        const deals = await db.collection('crm_deals').find({}).limit(2).toArray();
        console.log("=== DEALS ===");
        deals.forEach(d => console.log(Math.random(), d._id, d.title, "assignedTo:", d.assignedTo, "\n"));

        const users = await db.collection('users').find({}).limit(2).toArray();
        console.log("=== USERS ===");
        users.forEach(u => console.log(Math.random(), u._id, typeof u._id, u.name, "\n"));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
