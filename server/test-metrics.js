const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/voice-crm');
  const db = mongoose.connection.db;
  
  const PipelineConfig = db.collection('pipeline_configs');
  const configs = await PipelineConfig.find().toArray();
  console.log("Configs stages:", configs[0]?.stages.map(s => ({ key: s.key, order: s.order })));
  
  const Deal = db.collection('deals');
  const deals = await Deal.find().toArray();
  const statuses = Array.from(new Set(deals.map(d => d.status)));
  console.log("Deal statuses:", statuses);
  
  await mongoose.disconnect();
}
test().catch(console.error);
