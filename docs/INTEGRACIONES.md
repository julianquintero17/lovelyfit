# Integraciones — estado real

## GloryFitPro + reloj DM58 — **pendiente de prueba**
- GloryFitPro registra las salidas. Lovely Fit concentra gimnasio, comidas, medidas y dashboard (máximo dos apps).
- No sabemos aún si GloryFitPro exporta el recorrido. Mostrar un mapa en su app no garantiza exportación.
- Prueba propuesta: salida de 10 min → en GloryFitPro buscar "Compartir/Exportar" → si da GPX, importarlo en
  Entrenar → Registrar → *Importar GPX*. Si no, revisar si escribe el entrenamiento en Salud (con o sin ruta).
- Nunca se inventa una ruta a partir de pasos o distancia: sin coordenadas reales no hay mapa.
- El audio que sale por el reloj es un tema de Bluetooth del iPhone, separado de esto.

## Salud + Atajos — **listo para probar**
Camino: reloj DM58 → GloryFitPro → Apple Salud → Atajo diario → Supabase (`fit_ingest_health`) → Lovely Fit.

- En la app: Mis datos → Integraciones → **Conectar Salud** genera un token personal (se guarda solo su hash).
  El token **solo permite escribir** métricas del día y entrenamientos del dueño; no permite leer nada.
- El Atajo usa *Obtener contenido de URL* (POST JSON) — no abre Safari, así que no importa que Safari y la
  app instalada tengan almacenamiento separado.
- Reenviar el mismo día actualiza el valor (no duplica). Los entrenamientos se deduplican por hora de inicio y tipo.
- Límites conocidos: con el iPhone bloqueado Salud puede negar los datos (programar a una hora de uso);
  Atajos no expone rutas GPS; GloryFitPro declara HealthKit pero qué tipos escribe hay que verificarlo en Salud.
- Fuentes de la investigación: listing de GloryFitPro en App Store (HealthKit), Gadgetbridge (DM58 sin
  sincronización abierta), foro Automators (falla con teléfono bloqueado).

La ruta `/importar/?date=…&steps=…` sigue disponible para carga manual, pero ya no es el camino recomendado.

## Notificaciones — **no activas**
En iPhone requieren PWA instalada (iOS 16.4+), permiso y envío desde servidor (Web Push con claves VAPID).
Eso implica una función programada (ej. Supabase Edge Functions + cron) — verificar límites gratuitos antes.
La configuración de recordatorios ya se guarda (días, hora, mensaje) para usarla cuando se active.

## Fuera del MVP
Strava (pedía suscripción para crear app API; reverificar), adidas Running (sin API pública confirmada), n8n, apps nativas.
