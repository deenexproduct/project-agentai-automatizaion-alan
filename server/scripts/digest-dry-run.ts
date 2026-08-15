import mongoose from 'mongoose';
import { calcularDigest } from '../src/services/digest/pipeline-digest.service';
import { formatearDigest } from '../src/services/digest/digest-message';
import { UserModel } from '../src/models/user.model';

(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    const us = await UserModel.find({}, { _id: 1 }).lean();
    const digest = await calcularDigest(us.map(u => String(u._id)), new Date());
    const msg = formatearDigest(digest, { urlBase: 'https://comercial.deenex.tech' });
    console.log('─'.repeat(64));
    console.log(msg ?? '(sin novedades — no se manda nada)');
    console.log('─'.repeat(64));
    const t = digest.totales;
    console.log(`REAL → ${t.dealsFrios} deals frenados · USD ${t.usdCongelado.toLocaleString('es-AR')} · ${t.compromisosVencidos} compromisos vencidos`);
    await mongoose.disconnect();
})();
