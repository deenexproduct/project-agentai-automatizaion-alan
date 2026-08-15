import mongoose from 'mongoose';
import { calcularDigest, userIdsDelPipeline } from '../src/services/digest/pipeline-digest.service';
import { formatearDigest } from '../src/services/digest/digest-message';

(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
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
