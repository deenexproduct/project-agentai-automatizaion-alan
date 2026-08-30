// Fuente única del secreto de firma JWT.
//
// NUNCA usar un fallback hardcodeado: este repo es público, así que un secreto
// embebido permitiría a cualquiera forjar tokens válidos y suplantar usuarios.
// Si la variable de entorno falta, fallamos al arranque (fail-fast) en vez de
// degradar en silencio a un secreto conocido.
const secret = process.env.JWT_SECRET;

if (!secret) {
    throw new Error(
        'JWT_SECRET no está definido. Seteá la variable de entorno antes de arrancar el server ' +
        '(ver server/.env.example). No hay fallback por seguridad.'
    );
}

export const JWT_SECRET: string = secret;
