import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LinkedInAccountSchema = new mongoose.Schema({}, { strict: false });
const LinkedInAccount = mongoose.model('LinkedInAccount', LinkedInAccountSchema, 'linkedin_accounts');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voicecommand');
        const accounts = await LinkedInAccount.find({});
        console.log("Total DB Accounts:", accounts.length);
        for (const acc of accounts) {
            console.log(`- ID: ${acc._id}, UserID: ${acc.get('userId')}, Email: ${acc.get('email')}, Status: ${acc.get('status')}`);
        }
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        process.exit(0);
    }
}
run();
