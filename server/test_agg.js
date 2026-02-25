require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    const companyIds = [new mongoose.Types.ObjectId('699eecc679b4ee72bec4c182'), new mongoose.Types.ObjectId('699eebeca5445d832d4167a0')];
    const userId = new mongoose.Types.ObjectId('699d9386d93cc1dc427f6f03');

    const result = await db.collection('crm_contacts').aggregate([
        { $match: { $or: [{ company: { $in: companyIds } }, { companies: { $in: companyIds } }], userId } },
        {
            $project: {
                company: 1, companies: 1,
                matchedCompanies: {
                    $setUnion: [
                        { $cond: [{ $in: ['$company', companyIds] }, ['$company'], []] },
                        { $filter: { input: { $ifNull: ['$companies', []] }, cond: { $in: ['$$this', companyIds] } } }
                    ]
                }
            }
        },
        // { $unwind: '$matchedCompanies' },
        // { $group: { _id: '$matchedCompanies', count: { $sum: 1 } } }, // Uncomment to test full
    ]).toArray();
    
    console.log("Raw matched contacts:", JSON.stringify(result, null, 2));
    
    const finalResult = await db.collection('crm_contacts').aggregate([
        { $match: { $or: [{ company: { $in: companyIds } }, { companies: { $in: companyIds } }], userId } },
        {
            $project: {
                matchedCompanies: {
                    $setUnion: [
                        { $cond: [{ $in: ['$company', companyIds] }, ['$company'], []] },
                        { $filter: { input: { $ifNull: ['$companies', []] }, cond: { $in: ['$$this', companyIds] } } }
                    ]
                }
            }
        },
        { $unwind: '$matchedCompanies' },
        { $group: { _id: '$matchedCompanies', count: { $sum: 1 } } }
    ]).toArray();
    console.log("Grouped counts:", finalResult);

    process.exit(0);
}
test();
