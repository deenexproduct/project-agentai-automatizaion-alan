require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    // Find the contact shown in the screenshot ("Julio Gauna" for "Mr Tasty" which is company 699eebeca5445d832d4167a0 maybe?)
    const contact = await db.collection('crm_contacts').findOne({ fullName: 'Julio Gauna' });
    console.log("Contact found:", contact ? contact._id : "None");
    if (contact) {
        console.log("Type of company:", typeof contact.company, contact.company instanceof mongoose.Types.ObjectId ? "ObjectId" : "other");
        if (contact.companies && contact.companies.length) {
            console.log("Type of companies[0]:", typeof contact.companies[0], contact.companies[0] instanceof mongoose.Types.ObjectId ? "ObjectId" : "other");
        }
    }
    process.exit(0);
}
test();
