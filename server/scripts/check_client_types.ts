import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.DEENEX_MONGODB_URI as string);
        const db = mongoose.connection.db;
        if (!db) throw new Error('No db');
        const Pagos = db.collection('pagos');

        // 1. Total orders and revenue
        const orderStats = await Pagos.aggregate([
            { $group: { _id: null, totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalFacturado' } } }
        ]).toArray();
        console.log('--- ORDER STATS ---');
        console.log(orderStats);

        // 2. Per-client CLV from orders
        const clvFromOrders = await Pagos.aggregate([
            { $match: { idCliente: { $exists: true, $ne: null } } },
            { $group: { _id: '$idCliente', totalSpent: { $sum: '$totalFacturado' }, orderCount: { $sum: 1 } } },
            { $group: { _id: null, avgCLV: { $avg: '$totalSpent' }, maxCLV: { $max: '$totalSpent' }, totalRevenue: { $sum: '$totalSpent' }, totalBuyers: { $sum: 1 }, avgOrders: { $avg: '$orderCount' }, avgSpent: { $avg: '$totalSpent' } } }
        ]).toArray();
        console.log('\n--- CLV FROM ORDERS ---');
        console.log(clvFromOrders);

        // 3. Sample order to see fields
        const sampleOrder = await Pagos.findOne();
        console.log('\n--- SAMPLE ORDER ---');
        console.log(JSON.stringify(sampleOrder, null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
