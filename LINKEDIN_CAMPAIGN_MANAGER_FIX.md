# LinkedIn Campaign Manager Bug - Análisis y Fix

## 🐛 Problema
El bot ocasionalmente abre `https://www.linkedin.com/campaignmanager/accounts?businessId=personal` en lugar de enviar solicitudes de conexión.

## 🔍 Causa Raíz
1. El enlace "Publicidad" en el header de LinkedIn apunta a `/campaignmanager/accounts/`
2. Cuando el bot no encuentra el botón "Conectar" (porque ya hay una invitación "Pendiente"), a veces selecciona el elemento incorrecto
3. El clic en "Publicidad" abre Campaign Manager

## 📊 Evidencia del Log
```
[11] <BUTTON> text="Pendiente" aria="Pendiente. Haz clic para retirar la invitación enviada a Leo Graziano."
[9] <A> text="Publicidad" href="https://www.linkedin.com/campaignmanager/accounts/"
```

## 🛠️ Solución

### 1. Filtrar enlaces de Campaign Manager
Agregar validación para excluir cualquier elemento con href que contenga:
- `campaignmanager`
- `publicidad`
- `ads`

### 2. Detectar estado "Pendiente" antes de intentar conectar
Si el botón dice "Pendiente", marcar el perfil como ya invitado y saltar.

### 3. Validación más estricta del elemento
Antes de hacer clic, verificar que el elemento sea realmente un botón de conectar:
- Debe tener texto o aria-label que incluya "conectar" o "connect"
- No debe ser un enlace a otra página (href vacío o undefined)
- Debe estar en el área del perfil (top < 400)

## ✅ Implementación
Ver `linkedin.service.ts` con los cambios aplicados.
