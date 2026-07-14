const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const PipelineConfig = db.collection('pipeline_configs');
  const configs = await PipelineConfig.find().limit(1).toArray();
  console.log("CONFIG:", JSON.stringify(configs[0]?.stages.map(s => ({ key: s.key, order: s.order }))));
  
  const Deal = db.collection('deals');
  const deals = await Deal.find().toArray();
  const statuses = Array.from(new Set(deals.map(d => d.status)));
  console.log("ACTUAL DEAL STATUSES IN DB:", statuses);
  
  let reachedCoordinando = 0;
  deals.forEach(d => {
      if (d.status === 'coordinando') reachedCoordinando++;
  });
  console.log("Deals currently in 'coordinando':", reachedCoordinando);

  await mongoose.disconnect();
}
test().catch(console.error);
