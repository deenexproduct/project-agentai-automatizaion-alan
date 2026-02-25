require('dotenv').config();
const mongoose = require('mongoose');

// We need to register the schemas just like the app does.
// The easiest way is to require the models!
const { Task } = require('./src/models/task.model');
const { Company } = require('./src/models/company.model');
const { UserModel } = require('./src/models/user.model');
// Ensure UserModel is registered as 'User'
console.log("Registered models:", mongoose.modelNames());

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const tasks = await Task.find({}).populate('assignedTo', 'name profilePhotoUrl').limit(2).lean();
        console.log("=== POPULATED TASKS ===");
        console.log(JSON.stringify(tasks.map(t => ({ id: t._id, title: t.title, assignedTo: t.assignedTo })), null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
