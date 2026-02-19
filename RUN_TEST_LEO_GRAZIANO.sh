#!/bin/bash
# Script para probar el fix de Campaign Manager con Leo Graziano

echo "========================================="
echo "  TEST: LinkedIn Campaign Manager Fix"
echo "  Perfil: leo-graziano-14ab2011"
echo "========================================="
echo ""

# Verificar que el servidor está corriendo
echo "🔍 Verificando servidor..."
if ! pgrep -f "tsx.*src/index.ts" > /dev/null; then
    echo "❌ El servidor no está corriendo. Iniciándolo..."
    cd /Users/alannaimtapia/Desktop/Programacion/voice/server
    npm run dev > /tmp/server.log 2>&1 &
    sleep 5
    echo "✅ Servidor iniciado"
else
    echo "✅ Servidor ya está corriendo"
fi

echo ""
echo "📝 Últimos logs de Leo Graziano:"
echo "-----------------------------------"
LATEST_LOG=$(ls -t /Users/alannaimtapia/Desktop/Programacion/voice/server/logs/linkedin/leo-graziano* 2>/dev/null | head -1)

if [ -n "$LATEST_LOG" ]; then
    echo "📄 Archivo: $LATEST_LOG"
    echo ""
    echo "🔍 Buscando patrones relevantes..."
    echo ""
    
    # Buscar estado pendiente
    if grep -q "Connection already pending" "$LATEST_LOG"; then
        echo "✅ DETECTADO: 'Connection already pending'"
        grep "Connection already pending" "$LATEST_LOG" | tail -1
    fi
    
    # Buscar Campaign Manager (indicador de fallo)
    if grep -q "campaignmanager" "$LATEST_LOG"; then
        echo "❌ ALERTA: 'campaignmanager' encontrado en logs"
        grep "campaignmanager" "$LATEST_LOG" | tail -1
    else
        echo "✅ No hay referencias a Campaign Manager en logs recientes"
    fi
    
    # Buscar validación de elemento
    if grep -q "Element validation" "$LATEST_LOG"; then
        echo "ℹ️ Validación de elemento encontrada"
        grep "Element validation" "$LATEST_LOG" | tail -1
    fi
    
    echo ""
    echo "📊 Estadísticas del último intento:"
    grep -c "Conectar" "$LATEST_LOG" 2>/dev/null && echo "  - Referencias a 'Conectar': $(grep -c "Conectar" "$LATEST_LOG")"
    grep -c "Strategy" "$LATEST_LOG" 2>/dev/null && echo "  - Estrategias intentadas: $(grep -c "Strategy" "$LATEST_LOG")"
    
else
    echo "⚠️ No hay logs previos de Leo Graziano"
fi

echo ""
echo "========================================="
echo "  INSTRUCCIONES PARA PRUEBA MANUAL"
echo "========================================="
echo ""
echo "1. Abre el CRM en: http://localhost:5173"
echo ""
echo "2. Ve a la sección 'LinkedIn' > 'Automation'"
echo ""
echo "3. Agrega este perfil a la lista:"
echo "   https://www.linkedin.com/in/leo-graziano-14ab2011/"
echo ""
echo "4. Inicia la prospección y observa los logs"
echo ""
echo "5. Resultados esperados:"
echo "   ✅ Si ya está 'Pendiente': Debe saltarse con mensaje"
echo "      'Connection already pending — skipping'"
echo ""
echo "   ✅ Si se intenta conectar: NO debe abrir Campaign Manager"
echo ""
echo "6. Ver logs en tiempo real:"
echo "   tail -f /Users/alannaimtapia/Desktop/Programacion/voice/server/logs/linkedin/leo-graziano*.log"
echo ""
echo "========================================="
