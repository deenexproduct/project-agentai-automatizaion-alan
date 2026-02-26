const mongoose = require('mongoose');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Deal = mongoose.model('Deal', new mongoose.Schema({
    title: String,
    statusHistory: [{
      from: String,
      to: String,
      changedAt: Date,
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }, { collection: 'crm_deals' }));
  
  const User = mongoose.model('User', new mongoose.Schema({
    name: String, email: String, profilePhotoUrl: String
  }));

  const deals = await Deal.find({ "statusHistory": { $not: { $size: 0 } } })
    .populate('statusHistory.changedBy', 'name email').populate('userId', 'name email').limit(2).lean();
  
  console.log(JSON.stringify(deals, null, 2));
  process.exit(0);
}
test();
