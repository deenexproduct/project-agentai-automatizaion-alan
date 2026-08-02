/**
 * Devuelve el motivo real que mandó el backend.
 *
 * Los formularios del CRM mostraban un `alert('Error al guardar X')` genérico y
 * tiraban a la basura el mensaje del servidor: el usuario veía "Error al
 * guardar" sin enterarse de que la empresa ya existía o de que un campo estaba
 * fuera de rango.
 */
export function mensajeDeError(err: unknown, fallback: string): string {
    const data = (err as any)?.response?.data;
    const detalle = typeof data?.error === 'string' ? data.error.trim() : '';
    return detalle || fallback;
}
