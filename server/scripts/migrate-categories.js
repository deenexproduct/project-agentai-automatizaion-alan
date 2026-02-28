require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const db = mongoose.connection.db;

        // Get admin user (using Deenex as primary or first user)
        const user = await db.collection('users').findOne({}, { sort: { createdAt: 1 } });
        if (!user) {
            console.log("No user found");
            return;
        }

        // Get uniquely used categories from companies
        const distinctCategories = await db.collection('companies').distinct('category', { category: { $ne: null, $ne: "" } });
        console.log(`Found ${distinctCategories.length} unique categories used in Companies:`, distinctCategories);

        // Get SystemConfig
        let config = await db.collection('systemconfigs').findOne({ userId: user._id });
        if (!config) {
            console.log("No config found for user, creating one");
            // Basic initialization
            config = {
                userId: user._id,
                companyCategories: [],
                contactRoles: [],
                contactPositions: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await db.collection('systemconfigs').insertOne(config);
        }

        // Add any missing categories
        let addedCount = 0;
        const currentCategories = config.companyCategories || [];
        for (const cat of distinctCategories) {
            const formattedCat = cat.trim();
            if (formattedCat && !currentCategories.includes(formattedCat)) {
                currentCategories.push(formattedCat);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            await db.collection('systemconfigs').updateOne(
                { _id: config._id },
                { $set: { companyCategories: currentCategories, updatedAt: new Date() } }
            );
            console.log(`Successfully added ${addedCount} new unique categories to SystemConfig for user ${user._id}`);
        } else {
            console.log('No new categories needed to be added to SystemConfig.');
        }

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected');
    }
}

migrate();
