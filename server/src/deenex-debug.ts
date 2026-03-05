import mongoose from 'mongoose';
import 'dotenv/config';
import * as fs from 'fs';

async function main() {
    const output: string[] = [];
    const log = (msg: string) => { output.push(msg); console.log(msg); };

    const conn = await mongoose.createConnection(process.env.DEENEX_MONGODB_URI!).asPromise();

    const adminDb = conn.getClient().db().admin();
    const { databases } = await adminDb.listDatabases();

    log('═══ ALL DATABASES ON CLUSTER ═══');
    for (const db of databases) {
        log(`\n📁 ${db.name} (${Math.round((db.sizeOnDisk || 0) / 1024 / 1024)}MB)`);
        try {
            const dbConn = conn.getClient().db(db.name);
            const cols = await dbConn.listCollections().toArray();
            for (const colInfo of cols.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
                const count = await dbConn.collection(colInfo.name).countDocuments();
                if (count > 0) log(`   ${colInfo.name}: ${count}`);
            }
        } catch (e: any) {
            log(`   (err: ${e.message})`);
        }
    }

    fs.writeFileSync('/tmp/deenex-dbs.txt', output.join('\n'));
    await conn.close();
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
