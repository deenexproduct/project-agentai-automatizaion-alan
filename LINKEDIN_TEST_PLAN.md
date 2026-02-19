# Plan de Pruebas - LinkedIn Campaign Manager Fix

## 🎯 Objetivo
Verificar que el bot NO abra Campaign Manager y maneje correctamente el estado "Pendiente"

## 📋 Casos de Prueba

### Test 1: Perfil con invitación ya pendiente
**Perfil:** `https://www.linkedin.com/in/leo-graziano-14ab2011/`

**Pasos:**
1. Iniciar sesión de LinkedIn en el navegador
2. Ir al perfil de Leo Graziano
3. Verificar que ya muestra "Pendiente" (invitación enviada previamente)
4. Ejecutar el script de automation en este perfil

**Resultado Esperado:**
```
ℹ️ Connection already pending — skipping (status: "pendiente")
⏭️ Connect skipped (already connected or pending)
```

**Resultado NO deseado (anterior):**
```
🖱️ Clicking connect element...
⚠️ Navigation detected after clicking Connect — going back
(URL: https://www.linkedin.com/campaignmanager/accounts/)
```

---

### Test 2: Validación de elemento antes de clic
**Perfil:** Cualquier perfil

**Pasos:**
1. Abrir perfil
2. Ejecutar automation
3. Verificar en logs que se muestra la validación

**Resultado Esperado:**
```
✅ Strategy X: Found direct Connect element
📌 Scrolling connect element into view (strategy: X)
🖱️ Clicking connect element...
```

**Validación adicional:**
Si el elemento es inválido:
```
❌ Element validation failed — not a valid Connect button
```

---

### Test 3: Filtrado de enlaces de Campaign Manager
**Verificación en código:**

Los siguientes href deben ser EXCLUIDOS:
- `https://www.linkedin.com/campaignmanager/accounts/`
- Cualquier URL con `campaignmanager`
- Cualquier URL con `publicidad`
- Cualquier URL con `/ads/`

---

## 🔧 Cómo Ejecutar las Pruebas

### Opción A: Prueba Manual vía API

```bash
# 1. Asegurar que el servidor está corriendo
cd /Users/alannaimtapia/Desktop/Programacion/voice/server
npm run dev

# 2. En otra terminal, llamar al endpoint de prospection
curl -X POST http://localhost:3000/api/linkedin/prospect \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://www.linkedin.com/in/leo-graziano-14ab2011/"],
    "sendNote": false
  }'
```

### Opción B: Prueba desde el CRM

1. Abrir el CRM en `http://localhost:5173`
2. Ir a la sección de LinkedIn
3. Agregar el perfil `leo-graziano-14ab2011` a la lista
4. Iniciar prospección
5. Observar los logs en tiempo real

---

## 📊 Logs a Revisar

Ubicación: `/Users/alannaimtapia/Desktop/Programacion/voice/server/logs/linkedin/`

Archivo: `leo-graziano-14ab2011_*.log`

### Indicadores de Éxito

```
✅ Strategy 0: Found custom-invite <a> link
🖱️ Clicking connect element...
✅ Connection request sent successfully
```

O para perfiles ya invitados:
```
ℹ️ Connection already pending — skipping (status: "pendiente")
⏭️ Connect skipped (already connected or pending)
```

### Indicadores de Problema (ANTES del fix)

```
⚠️ Navigation detected after clicking Connect — going back
URL: https://www.linkedin.com/campaignmanager/accounts/
```

---

## ✅ Checklist de Validación

- [ ] El bot detecta correctamente el estado "Pendiente"
- [ ] El bot NO hace clic en enlaces de Campaign Manager
- [ ] El bot valida el elemento antes de hacer clic
- [ ] Los logs muestran las estrategias correctas
- [ ] No hay navegaciones inesperadas

---

## 🐛 Si Aún Hay Problemas

Si el bot sigue abriendo Campaign Manager:

1. **Revisar logs detalladamente:**
   ```bash
   tail -100 /Users/alannaimtapia/Desktop/Programacion/voice/server/logs/linkedin/leo-graziano-14ab2011_*.log
   ```

2. **Verificar que el build se haya aplicado:**
   ```bash
   cd /Users/alannaimtapia/Desktop/Programacion/voice/server
   grep -n "campaignmanager" dist/services/linkedin.service.js
   ```
   Debe aparecer el código de filtrado.

3. **Reiniciar el servidor:**
   ```bash
   pkill -f "node dist/index.js"
   npm run dev
   ```
