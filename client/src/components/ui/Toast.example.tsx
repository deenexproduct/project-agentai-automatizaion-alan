/**
 * Ejemplo de uso del sistema de Toast
 * 
 * Este archivo es solo para documentación. Copia los ejemplos en tus componentes.
 */

import { useToast } from '../../hooks/useToast';

function EjemploDeUso() {
  const { toast } = useToast();

  const mostrarEjemplos = () => {
    // Toast de éxito
    toast.success('Contacto movido a Aceptado');

    // Toast de error con duración personalizada
    toast.error('Error al enriquecer contacto', {
      duration: 10000, // 10 segundos
    });

    // Toast con mensaje descriptivo
    toast.success('Mensaje enviado', 'El mensaje fue enviado exitosamente a Juan Pérez');

    // Toast con acción
    toast.info('Nueva versión disponible', 'Hay una actualización disponible', {
      action: {
        label: 'Actualizar',
        onClick: () => {
          console.log('Actualizando...');
        },
      },
    });

    // Toast de advertencia
    toast.warning('Límite alcanzado', 'Has alcanzado el límite de contactos gratuitos');

    // Toast en posición diferente
    toast.info('Notificación', 'Aparecerá en la esquina inferior derecha', {
      position: 'bottom-right',
    });
  };

  return (
    <button onClick={mostrarEjemplos}>
      Mostrar Toasts de Ejemplo
    </button>
  );
}

/**
 * OPCIONES DISPONIBLES:
 * 
 * toast.success(title, message?, options?)
 * toast.error(title, message?, options?)
 * toast.warning(title, message?, options?)
 * toast.info(title, message?, options?)
 * 
 * Opciones:
 * - duration: número en ms (default: 5000)
 * - position: 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left'
 * - action: { label: string, onClick: () => void }
 * 
 * CARACTERÍSTICAS:
 * - Máximo 3 toasts por posición (el más viejo se descarta)
 * - Auto-dismiss después de 5 segundos (configurable)
 * - Pausa al hacer hover
 * - Swipe para cerrar en mobile
 * - Animaciones fluidas (300ms ease)
 * - Accesibilidad: aria-live="polite"
 */

export default EjemploDeUso;
