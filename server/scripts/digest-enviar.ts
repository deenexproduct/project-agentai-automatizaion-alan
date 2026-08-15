import mongoose from 'mongoose';
import { calcularDigest, userIdsDelPipeline } from '../src/services/digest/pipeline-digest.service';
import { formatearDigest } from '../src/services/digest/digest-message';
import { enviarPorWhatsApp, listarGrupos, estadoWhatsApp } from '../src/services/digest/wa-send.client';

/**
 * Disparo MANUAL del digest. No hay cron todavía, y es a propósito: nadie deja
 * andando algo que manda mensajes sin haber visto uno primero.
 *
 *   npx tsx server/scripts/digest-enviar.ts                      → muestra el texto, NO manda
 *   npx tsx server/scripts/digest-enviar.ts --grupos deenex      → lista grupos y sus JIDs
 *   npx tsx server/scripts/digest-enviar.ts --enviar --to <jid>  → manda UNA vez
 *
 * Ojo con dónde se corre: wa-send escucha en 127.0.0.1, así que esto solo
 * funciona desde la máquina que tiene la sesión de WhatsApp vinculada.
 */

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const valor = (n: string) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
};

const URL_BASE = process.env.DIGEST_URL_BASE || 'https://comercial.deenex.tech';
const raya = () => console.log('─'.repeat(64));

async function conectar() {
    // `MONGODB_URI` es la que usa src/db.ts, pero .env.example documenta
    // `MONGO_URI`. Aceptamos las dos: sin esto el script recibe undefined y
    // falla con un error de mongoose que no dice cuál es el problema real.
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('Falta MONGODB_URI (o MONGO_URI) en el entorno.');
        process.exit(1);
    }
    await mongoose.connect(uri);
    return uri;
}

async function main() {
    // --grupos no necesita la base: es solo para encontrar el JID de destino.
    if (flag('grupos')) {
        const gs = await listarGrupos(valor('grupos'));
        if (!gs.length) return console.log('No encontré grupos con ese nombre.');
        console.log('Grupos (el JID es lo que va en --to):');
        for (const g of gs) console.log(`  ${g.jid}   ${g.subject}`);
        return;
    }

    const uri = await conectar();
    const anonima = uri.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
    console.log(`base: ${anonima}`);

    const digest = await calcularDigest(await userIdsDelPipeline(), new Date());
    const texto = formatearDigest(digest, { urlBase: URL_BASE });
    const t = digest.totales;

    raya();
    console.log(texto ?? '(sin novedades — no se manda nada)');
    raya();
    console.log(`REAL → ${t.dealsFrios} deals frenados · USD ${t.usdCongelado.toLocaleString('es-AR')} · ${t.compromisosVencidos} compromisos vencidos`);
    console.log(`(${texto?.split('\n').length ?? 0} líneas, ${texto?.length ?? 0} caracteres)`);

    if (!flag('enviar')) {
        console.log('\nNo mandé nada. Para mandarlo: --enviar --to <jid>');
        return;
    }

    // A partir de acá sí sale un mensaje a una persona real.
    if (!texto) {
        console.log('\nNo hay nada que contar, así que no mando nada.');
        return;
    }
    const destino = valor('to');
    if (!destino) {
        console.error('\nFalta --to <jid>. Buscalo con --grupos <nombre>.');
        process.exit(1);
    }

    const estado = await estadoWhatsApp();
    if (!estado.conectado) {
        console.error('\nwa-send no tiene sesión de WhatsApp vinculada. Abrí http://127.0.0.1:3131/qr y escaneá.');
        process.exit(1);
    }
    console.log(`\nMandando desde ${estado.me} → ${destino}`);

    const r = await enviarPorWhatsApp(destino, texto);
    console.log(`✓ Enviado. id=${r.id} chat=${r.chatJid}`);
}

main()
    .catch(e => { console.error(`\n✗ ${e.message}`); process.exitCode = 1; })
    .finally(() => mongoose.connection.readyState && mongoose.disconnect());
