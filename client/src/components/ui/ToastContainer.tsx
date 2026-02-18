import React, { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useToastContext, ToastPosition } from '../../contexts/ToastContext';
import { Toast } from './Toast';

interface PositionStyles {
  container: string;
  alignment: string;
}

const positionStyles: Record<ToastPosition, PositionStyles> = {
  'top-right': {
    container: 'top-4 right-4',
    alignment: 'items-end',
  },
  'top-left': {
    container: 'top-4 left-4',
    alignment: 'items-start',
  },
  'top-center': {
    container: 'top-4 left-1/2 -translate-x-1/2',
    alignment: 'items-center',
  },
  'bottom-right': {
    container: 'bottom-4 right-4',
    alignment: 'items-end',
  },
  'bottom-left': {
    container: 'bottom-4 left-4',
    alignment: 'items-start',
  },
};

export function ToastContainer() {
  const { toasts } = useToastContext();
  const [toastHeights, setToastHeights] = useState<Map<string, number>>(new Map());

  const handleHeightChange = useCallback((id: string, height: number) => {
    setToastHeights((prev) => {
      const next = new Map(prev);
      next.set(id, height);
      return next;
    });
  }, []);

  // Agrupar toasts por posición
  const toastsByPosition = useMemo(() => {
    const grouped: Record<ToastPosition, typeof toasts> = {
      'top-right': [],
      'top-left': [],
      'top-center': [],
      'bottom-right': [],
      'bottom-left': [],
    };

    toasts.forEach((toast) => {
      grouped[toast.position].push(toast);
    });

    return grouped;
  }, [toasts]);

  // Verificar si hay toasts para mostrar
  const hasToasts = toasts.length > 0;

  if (!hasToasts) return null;

  return createPortal(
    <>
      {(Object.keys(toastsByPosition) as ToastPosition[]).map((position) => {
        const positionToasts = toastsByPosition[position];
        
        if (positionToasts.length === 0) return null;

        const styles = positionStyles[position];
        const isBottom = position.startsWith('bottom');

        return (
          <div
            key={position}
            className={`
              fixed ${styles.container}
              z-[9999] flex flex-col gap-2
              ${styles.alignment}
              max-w-full p-4 pointer-events-none
              ${isBottom ? 'flex-col-reverse' : 'flex-col'}
            `}
            aria-live="polite"
            aria-atomic="false"
          >
            {/* 
              Orden de renderizado:
              - Top positions: Los nuevos aparecen arriba (índice 0 es el más nuevo)
              - Bottom positions: Los nuevos aparecen abajo (índice 0 es el más nuevo)
              
              Como usamos flex-col-reverse en bottom, el orden visual se invierte
            */}
            {positionToasts.map((toast, index) => (
              <Toast
                key={toast.id}
                toast={toast}
                index={index}
                onHeightChange={handleHeightChange}
              />
            ))}
          </div>
        );
      })}
    </>,
    document.body
  );
}
