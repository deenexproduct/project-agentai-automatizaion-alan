import mongoose from 'mongoose';
import { calcularDigest, userIdsDelPipeline } from '../src/services/digest/pipeline-digest.service';
import { formatearDigest } from '../src/services/digest/digest-message';

(async () => {
    // .env.example documenta MONGO_URI y src/db.ts usa MONGODB_URI: aceptamos las
    // dos, si no el script recibe undefined y falla con un error de mongoose que
    // no dice cuál es el problema real.
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) { console.error('Falta MONGODB_URI (o MONGO_URI).'); process.exit(1); }
    await mongoose.connect(uri);
    // Los dueños salen del pipeline, no de `users`: hay deals cuyo userId no
    // existe en esa colección y arrancando de ahí se perdían enteros.
    const digest = await calcularDigest(await userIdsDelPipeline(), new Date());
    const msg = formatearDigest(digest, { urlBase: 'https://comercial.deenex.tech' });
    console.log('─'.repeat(64));
    console.log(msg ?? '(sin novedades — no se manda nada)');
    console.log('─'.repeat(64));
    const t = digest.totales;
    console.log(`REAL → ${t.dealsFrios} deals frenados · USD ${t.usdCongelado.toLocaleString('es-AR')} · ${t.compromisosVencidos} compromisos vencidos`);
    await mongoose.disconnect();
})();
