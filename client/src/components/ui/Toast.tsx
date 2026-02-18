import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Info, 
  X 
} from 'lucide-react';
import { Toast as ToastType, useToastContext } from '../../contexts/ToastContext';

interface ToastProps {
  toast: ToastType;
  onHeightChange: (id: string, height: number) => void;
  index: number;
}

const toastConfig = {
  success: {
    icon: CheckCircle2,
    colors: {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      icon: 'text-emerald-500',
      progress: 'bg-emerald-500',
    },
  },
  error: {
    icon: XCircle,
    colors: {
      border: 'border-red-200',
      bg: 'bg-red-50',
      icon: 'text-red-500',
      progress: 'bg-red-500',
    },
  },
  warning: {
    icon: AlertTriangle,
    colors: {
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      icon: 'text-amber-500',
      progress: 'bg-amber-500',
    },
  },
  info: {
    icon: Info,
    colors: {
      border: 'border-blue-200',
      bg: 'bg-blue-50',
      icon: 'text-blue-500',
      progress: 'bg-blue-500',
    },
  },
};

export function Toast({ toast, onHeightChange, index }: ToastProps) {
  const { removeToast, pauseToast, resumeToast } = useToastContext();
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isRemoving, setIsRemoving] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const remainingRef = useRef<number>(toast.duration);
  const touchStartX = useRef<number | null>(null);

  const config = toastConfig[toast.type];
  const Icon = config.icon;

  // Medir altura para el stack
  useEffect(() => {
    if (toastRef.current) {
      const height = toastRef.current.getBoundingClientRect().height;
      onHeightChange(toast.id, height);
    }
  }, [toast.id, onHeightChange]);

  // Animación de entrada
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Progress bar animation
  useEffect(() => {
    if (isPaused || isRemoving) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min((elapsed / remainingRef.current) * 100, 100);

      if (progressRef.current) {
        progressRef.current.style.width = `${progress}%`;
      }

      if (progress < 100) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPaused, isRemoving, toast.duration]);

  const handleMouseEnter = useCallback(() => {
    setIsPaused(true);
    pauseToast(toast.id);
    if (startTimeRef.current && animationRef.current) {
      const elapsed = performance.now() - startTimeRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }
  }, [pauseToast, toast.id]);

  const handleMouseLeave = useCallback(() => {
    setIsPaused(false);
    resumeToast(toast.id);
    startTimeRef.current = null;
  }, [resumeToast, toast.id]);

  const handleClose = useCallback(() => {
    if (isRemoving) return;
    setIsRemoving(true);
    setIsVisible(false);
    setTimeout(() => {
      removeToast(toast.id);
    }, 300);
  }, [isRemoving, removeToast, toast.id]);

  // Swipe handlers para mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    
    const touchX = e.touches[0].clientX;
    const diff = touchX - touchStartX.current;
    
    // Solo permitir swipe hacia la derecha para cerrar
    if (diff > 0) {
      setSwipeOffset(Math.min(diff, 100));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset > 50) {
      handleClose();
    } else {
      setSwipeOffset(0);
    }
    touchStartX.current = null;
  }, [swipeOffset, handleClose]);

  // Ajustar posición en el stack
  const getStackStyles = () => {
    const baseOffset = index * 12; // Espaciado entre toasts
    const scale = 1 - index * 0.05;
    const opacity = 1 - index * 0.15;
    
    return {
      transform: `translateY(${baseOffset}px) scale(${Math.max(scale, 0.9)}) translateX(${swipeOffset}px)`,
      opacity: isVisible ? Math.max(opacity, 0.4) : 0,
      zIndex: 1000 - index,
    };
  };

  // Determinar clases de animación según posición
  const getPositionClasses = () => {
    switch (toast.position) {
      case 'top-left':
        return isVisible ? 'translate-x-0' : '-translate-x-full';
      case 'top-center':
        return isVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0';
      case 'bottom-left':
        return isVisible ? 'translate-x-0' : '-translate-x-full';
      case 'bottom-right':
        return isVisible ? 'translate-x-0' : 'translate-x-full';
      case 'top-right':
      default:
        return isVisible ? 'translate-x-0' : 'translate-x-full';
    }
  };

  return (
    <div
      ref={toastRef}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={`
        w-full max-w-sm pointer-events-auto
        transition-all duration-300 ease-out
        ${getPositionClasses()}
      `}
      style={getStackStyles()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`
          relative overflow-hidden rounded-lg shadow-lg
          border ${config.colors.border} ${config.colors.bg}
          bg-white
        `}
      >
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100">
          <div
            ref={progressRef}
            className={`h-full ${config.colors.progress} transition-none`}
            style={{ width: '0%' }}
          />
        </div>

        <div className="p-4 pr-10">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`flex-shrink-0 ${config.colors.icon}`}>
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {toast.title}
              </p>
              {toast.message && (
                <p className="mt-1 text-sm text-gray-600">
                  {toast.message}
                </p>
              )}

              {/* Action button */}
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.onClick();
                    handleClose();
                  }}
                  className={`
                    mt-2 text-sm font-medium
                    ${config.colors.icon}
                    hover:opacity-80 transition-opacity
                    focus:outline-none focus:ring-2 focus:ring-offset-2
                    rounded px-2 py-1 -ml-2
                  `}
                >
                  {toast.action.label}
                </button>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className={`
                absolute top-3 right-3 p-1 rounded-md
                text-gray-400 hover:text-gray-600
                hover:bg-gray-100
                transition-colors focus:outline-none
                focus:ring-2 focus:ring-gray-200
              `}
              aria-label="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
