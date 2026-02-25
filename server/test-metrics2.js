const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/voice-crm');
  const db = mongoose.connection.db;
  
  const PipelineConfig = db.collection('pipeline_configs');
  const configs = await PipelineConfig.find().toArray();
  const config = configs[0] || { stages: [
    { key: 'coordinando', order: 3 },
    { key: 'reuniones', order: 5 },
    { key: 'negociacion', order: 6 },
    { key: 'ganado', order: 7 },
    { key: 'perdido', order: 8 }
  ]};

  let wonStageKeys = ['ganado'];
  let lostStageKeys = ['perdido'];
  
  const Deal = db.collection('deals');
  const deals = await Deal.find().toArray();
  
  let reachedCoordinandoOrFurther = 0;
  let reachedFurtherThanCoordinando = 0;
  let currentlyInCoordinando = 0;
  let lostDeals = 0;

  deals.forEach((deal) => {
    if (lostStageKeys.includes(deal.status)) lostDeals++;
    if (deal.status === 'coordinando') currentlyInCoordinando++;
    
    const touchedStages = new Set();
    touchedStages.add(deal.status);
    if (deal.statusHistory && deal.statusHistory.length > 0) {
      deal.statusHistory.forEach((h) => {
        touchedStages.add(h.from);
        touchedStages.add(h.to);
      });
    }

    const maxOrderTouched = Array.from(touchedStages).reduce((max, stageKey) => {
      const stageDef = config.stages.find(s => s.key === stageKey);
      return Math.max(max, stageDef ? stageDef.order : 0);
    }, 0);

    const coordinandoStageDef = config.stages.find(s => s.key === 'coordinando');
    const coordinandoOrder = coordinandoStageDef ? coordinandoStageDef.order : 3;

    if (maxOrderTouched >= coordinandoOrder) {
      reachedCoordinandoOrFurther++;
      if (maxOrderTouched > coordinandoOrder) {
        reachedFurtherThanCoordinando++;
      }
    }
  });

  console.log("Total Deals:", deals.length);
  console.log("currentlyInCoordinando:", currentlyInCoordinando);
  console.log("reachedCoordinandoOrFurther:", reachedCoordinandoOrFurther);
  console.log("reachedFurtherThanCoordinando:", reachedFurtherThanCoordinando);

  await mongoose.disconnect();
}
test().catch(console.error);
