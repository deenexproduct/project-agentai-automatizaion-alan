import { Response } from 'express';

/**
 * Traduce errores de Mongoose a códigos HTTP con sentido.
 *
 * Antes, cualquier fallo en las altas caía en un `catch` que devolvía
 * 500 "Failed to create X": el front no podía distinguir "el usuario cargó mal
 * un campo" (400) de "se cayó el servidor" (500), ni decirle QUÉ campo estaba mal.
 *
 * Devuelve true si manejó el error; false si es un error genuinamente inesperado
 * y el llamador debe responder 500.
 */
export function sendValidationError(res: Response, err: any): boolean {
    // Campos que no pasan las reglas del schema (requeridos, min, enum, formato)
    if (err?.name === 'ValidationError') {
        const campos = Object.keys(err.errors || {});
        const detalle = campos
            .map((campo) => err.errors[campo]?.message || campo)
            .join('; ');
        res.status(400).json({
            error: detalle || 'Datos inválidos',
            fields: campos,
        });
        return true;
    }

    // Un ObjectId mal formado llegaba como 500; es un input inválido (400)
    if (err?.name === 'CastError') {
        res.status(400).json({
            error: `El campo "${err.path}" no tiene un valor válido`,
            fields: [err.path],
        });
        return true;
    }

    // Índice único violado
    if (err?.code === 11000) {
        const campos = Object.keys(err.keyPattern || {});
        res.status(409).json({
            error: 'Ya existe un registro con esos datos',
            fields: campos,
        });
        return true;
    }

    return false;
}
