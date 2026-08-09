import api from '../lib/axios';

export interface ManoData {
    _id: string;
    partnerNombre: string;
    comentario?: string;
    levantadaEn: string;
    estado: 'ofrecida' | 'aceptada' | 'descartada';
}

export interface MarcaBuscadaData {
    _id: string;
    nombre: string;
    porQue?: string;
    categoria?: string;
    estado: 'buscando' | 'con_manos' | 'ascendida' | 'archivada';
    manos: ManoData[];
    companyId?: string | null;
}

export const getMarcasBuscadas = async () =>
    (await api.get<{ marcas: MarcaBuscadaData[] }>('/marcas-buscadas')).data;
export const crearMarcaBuscada = async (datos: { nombre: string; porQue?: string; categoria?: string }) =>
    (await api.post<MarcaBuscadaData>('/marcas-buscadas', datos)).data;
export const archivarMarca = async (id: string) =>
    (await api.patch(`/marcas-buscadas/${id}`, { estado: 'archivada' })).data;
export const aceptarMano = async (marcaId: string, manoId: string) =>
    (await api.post(`/marcas-buscadas/${marcaId}/manos/${manoId}/aceptar`)).data;
export const descartarMano = async (marcaId: string, manoId: string) =>
    (await api.post(`/marcas-buscadas/${marcaId}/manos/${manoId}/descartar`)).data;
