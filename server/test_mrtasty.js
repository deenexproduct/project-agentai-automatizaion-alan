require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const mrTasty = await db.collection('crm_companies').find({ name: 'Mr Tasty' }).toArray();
    console.log("Mr Tasty Companies:");
    mrTasty.forEach(c => console.log(c._id, c.name, "created:", c.createdAt));

    process.exit(0);
}
test();
