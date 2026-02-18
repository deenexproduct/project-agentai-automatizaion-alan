import React, { createContext, useCallback, useContext, useState, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  duration?: number;
  position?: ToastPosition;
  action?: ToastAction;
}

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  position: ToastPosition;
  action?: ToastAction;
  createdAt: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, title: string, message?: string, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_DURATION = 5000;
const DEFAULT_POSITION: ToastPosition = 'top-right';
const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const pausedRef = useRef<Set<string>>(new Set());
  const remainingTimeRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    
    const timerId = timersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    pausedRef.current.delete(id);
    remainingTimeRef.current.delete(id);
  }, []);

  const startTimer = useCallback((id: string, duration: number) => {
    const timerId = window.setTimeout(() => {
      removeToast(id);
    }, duration);
    timersRef.current.set(id, timerId);
  }, [removeToast]);

  const addToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    options?: ToastOptions
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = options?.duration ?? DEFAULT_DURATION;
    const position = options?.position ?? DEFAULT_POSITION;

    const newToast: Toast = {
      id,
      type,
      title,
      message,
      duration,
      position,
      action: options?.action,
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      // Filtrar por posición para mantener máximo 3 toasts por posición
      const toastsInPosition = prev.filter((t) => t.position === position);
      let updatedToasts = prev;
      
      // Si hay 3 o más toasts en esta posición, eliminar el más antiguo
      if (toastsInPosition.length >= MAX_TOASTS) {
        const oldestToast = toastsInPosition[0];
        updatedToasts = prev.filter((t) => t.id !== oldestToast.id);
        removeToast(oldestToast.id);
      }
      
      // Agregar nuevo toast al final (aparecerá arriba con flex-col-reverse)
      return [...updatedToasts, newToast];
    });

    // Iniciar timer para auto-dismiss
    startTimer(id, duration);
  }, [removeToast, startTimer]);

  const pauseToast = useCallback((id: string) => {
    if (pausedRef.current.has(id)) return;
    
    const timerId = timersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
      pausedRef.current.add(id);
    }
  }, []);

  const resumeToast = useCallback((id: string) => {
    if (!pausedRef.current.has(id)) return;
    
    const toast = toasts.find((t) => t.id === id);
    if (toast) {
      startTimer(id, toast.duration);
      pausedRef.current.delete(id);
    }
  }, [toasts, startTimer]);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        addToast,
        removeToast,
        pauseToast,
        resumeToast,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
}
