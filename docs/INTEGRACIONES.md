# Integraciones — estado real

## GloryFitPro + reloj DM58 — **pendiente de prueba**
- GloryFitPro registra las salidas. Lovely Fit concentra gimnasio, comidas, medidas y dashboard (máximo dos apps).
- No sabemos aún si GloryFitPro exporta el recorrido. Mostrar un mapa en su app no garantiza exportación.
- Prueba propuesta: salida de 10 min → en GloryFitPro buscar "Compartir/Exportar" → si da GPX, importarlo en
  Entrenar → Registrar → *Importar GPX*. Si no, revisar si escribe el entrenamiento en Salud (con o sin ruta).
- Nunca se inventa una ruta a partir de pasos o distancia: sin coordenadas reales no hay mapa.
- El audio que sale por el reloj es un tema de Bluetooth del iPhone, separado de esto.

## Salud + Atajos — **implementado, sin probar en iPhone**
Lovely Fit acepta: `https://TU-APP.vercel.app/importar/?date=AAAA-MM-DD&steps=8123`
(opcionales: `active_kcal`, `exercise_min`, `resting_hr`). Muestra los valores y guarda al confirmar.
Reimportar el mismo día **reemplaza** (fecha + tipo + fuente), no duplica.

Atajo sugerido (a armar y verificar):
1. *Buscar muestras de Salud*: Pasos, fecha = ayer, agrupar por día → *Calcular estadísticas* (suma).
2. *Formatear fecha* (ayer) con formato personalizado `yyyy-MM-dd`.
3. *Texto*: `https://TU-APP.vercel.app/importar/?date=[Fecha]&steps=[Suma]`.
4. *Abrir URL*.

**Limitación importante:** "Abrir URL" abre **Safari**, no la app instalada, y en iOS no comparten almacenamiento.
Por eso este camino solo sirve de verdad **con la nube activada** y la misma cuenta iniciada en Safari:
el dato entra en Safari, se sube a Supabase y la app instalada lo baja. Sin nube, el dato queda en Safari.
Además: Salud puede no responder con el teléfono bloqueado; la automatización diaria no está garantizada.
Importar el día anterior completo evita datos parciales.

La energía activa se guarda como dato, **no** se suma a ningún presupuesto de comida.

## Notificaciones — **no activas**
En iPhone requieren PWA instalada (iOS 16.4+), permiso y envío desde servidor (Web Push con claves VAPID).
Eso implica una función programada (ej. Supabase Edge Functions + cron) — verificar límites gratuitos antes.
La configuración de recordatorios ya se guarda (días, hora, mensaje) para usarla cuando se active.

## Fuera del MVP
Strava (pedía suscripción para crear app API; reverificar), adidas Running (sin API pública confirmada), n8n, apps nativas.
