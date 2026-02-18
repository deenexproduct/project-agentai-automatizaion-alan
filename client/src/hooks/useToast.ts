import { useCallback } from 'react';
import { useToastContext, ToastType, ToastOptions } from '../contexts/ToastContext';

interface UseToastReturn {
  success: (title: string, message?: string, options?: ToastOptions) => void;
  error: (title: string, message?: string, options?: ToastOptions) => void;
  warning: (title: string, message?: string, options?: ToastOptions) => void;
  info: (title: string, message?: string, options?: ToastOptions) => void;
  custom: (type: ToastType, title: string, message?: string, options?: ToastOptions) => void;
}

export function useToast(): UseToastReturn {
  const { addToast } = useToastContext();

  const success = useCallback(
    (title: string, message?: string, options?: ToastOptions) => {
      addToast('success', title, message, options);
    },
    [addToast]
  );

  const error = useCallback(
    (title: string, message?: string, options?: ToastOptions) => {
      addToast('error', title, message, options);
    },
    [addToast]
  );

  const warning = useCallback(
    (title: string, message?: string, options?: ToastOptions) => {
      addToast('warning', title, message, options);
    },
    [addToast]
  );

  const info = useCallback(
    (title: string, message?: string, options?: ToastOptions) => {
      addToast('info', title, message, options);
    },
    [addToast]
  );

  const custom = useCallback(
    (type: ToastType, title: string, message?: string, options?: ToastOptions) => {
      addToast(type, title, message, options);
    },
    [addToast]
  );

  return {
    success,
    error,
    warning,
    info,
    custom,
  };
}

export type { ToastOptions, ToastType } from '../contexts/ToastContext';
