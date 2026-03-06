import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.DEENEX_MONGODB_URI as string);
        const db = mongoose.connection.db;
        if (!db) throw new Error("Database not connected");

        const Pagos = db.collection('pagos');
        const types = await Pagos.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]).toArray();
        console.log('--- TYPE VALUES IN PAGOS ---');
        console.log(types);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
