require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;

        // Find the matching tasks/deals to see if they specifically lack assignedTo
        const doc1 = await db.collection('crm_tasks').findOne({ _id: new mongoose.Types.ObjectId('699ee671b87698aeffbaae31') });
        console.log("DB Task 699ee671b87698aeffbaae31 assignedTo:", doc1 ? doc1.assignedTo : "not found");

        const doc2 = await db.collection('crm_deals').findOne({ _id: new mongoose.Types.ObjectId('699ee73bb87698aeffbaaeb3') });
        console.log("DB Deal 699ee73bb87698aeffbaaeb3 assignedTo:", doc2 ? doc2.assignedTo : "not found");

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
