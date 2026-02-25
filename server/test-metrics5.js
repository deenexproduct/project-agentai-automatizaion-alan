const mongoose = require('mongoose');

async function test() {
    await mongoose.connect('mongodb+srv://plataformacomercial_db_user:IibBxQoLLn5u30FR@deenex-comercial.p9pcnz3.mongodb.net/comercial');
    const db = mongoose.connection.db;

    const PipelineConfig = db.collection('pipeline_configs');
    const configs = await PipelineConfig.find().limit(1).toArray();
    const config = configs[0] || { stages: [] };
    console.log("CONFIG STAGES:", config.stages.map(s => ({ key: s.key, order: s.order })));

    const Deal = db.collection('crm_deals');
    const deals = await Deal.find().toArray();

    const statuses = Array.from(new Set(deals.map(d => d.status)));
    console.log("ACTUAL DEAL STATUSES IN DB:", statuses);

    let reachedCoordinandoOrFurther = 0;
    let reachedFurtherThanCoordinando = 0;
    let currentlyInCoordinando = 0;
    let lostDeals = 0;

    deals.forEach((deal) => {
        if (deal.status === 'perdido') lostDeals++;
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
            return Math.max(max, stageDef ? stageDef.order : 0); // If undefined order, it returns 0. Wait, maybe order is missing?
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
    console.log("lostDeals:", lostDeals);
    console.log("currentlyInCoordinando:", currentlyInCoordinando);
    console.log("reachedCoordinandoOrFurther:", reachedCoordinandoOrFurther);
    console.log("reachedFurtherThanCoordinando:", reachedFurtherThanCoordinando);

    await mongoose.disconnect();
}
test().catch(console.error);
