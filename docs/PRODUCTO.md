# Producto — Lovely Fit (v0.1)

## Objetivo
App personal para sostener una meta semanal de sesiones, registrar fuerza con detalle, comer de forma práctica
y ver progreso (peso, cintura, cargas, movimiento) sin obsesión ni culpa.
Datos separados por usuario desde el inicio.

## Estado real de cada función

| Función | Estado |
|---|---|
| Perfil editable con datos declarados | ✅ Hecho. Los datos se cargan en el onboarding; el peso aproximado sin fecha **no** se trata como medición. |
| Plan A–D editable (días, ejercicios, series, rangos, descansos, orden) | ✅ Hecho. Borrador, no plan profesional. |
| Sesión de fuerza: kg/repes, carga anterior, completar con un toque, descanso, autoguardado, sustituir/omitir/quitar/reordenar, recuperar sesión interrumpida | ✅ Hecho y probado (E2E). |
| Sugerencia de progresión (rango completo 2 sesiones seguidas, sin "duro") | ✅ Sugerencia, no orden. |
| Comidas: habituales, porción chica/normal/grande, foto opcional, kcal editable con "sin estimación" ≠ 0, comida libre | ✅ Hecho. Sin meta calórica (faltan datos). |
| Peso, cintura, pasos manuales, caminata/bici/carrera manual | ✅ Hecho. |
| Importar GPX (mapa solo con coordenadas reales, sin tiles de terceros) | ✅ Hecho. Falta saber si GloryFitPro exporta GPX. |
| Importar de Salud vía Atajos (`/importar/?date=…&steps=…`) | 🟡 Implementado, **sin probar en iPhone**. Ver INTEGRACIONES.md. |
| Hábitos: pausas activas (2/día) y "noche sin picoteo" | ✅ Contador diario. No se marcan como cumplidos por defecto. |
| Dashboard semana/mes, evolución de cargas, logros por constancia sin rachas | ✅ Solo con datos reales; "—"/"sin datos" distinto de 0. |
| Offline (abrir y registrar sin conexión tras la primera carga) | ✅ Probado (E2E, Chromium). Pendiente prueba en iPhone. |
| Respaldo JSON (con/sin fotos), importar sin duplicar | ✅ Hecho. |
| Sincronización Supabase (cola persistente, upsert idempotente, LWW, fotos en bucket privado) | 🟡 Migración aplicada, RLS verificado. Falta prueba con cuenta real. |
| Recordatorios | 🟡 Configurables y guardados; **no se envían** (requiere push desde servidor, a verificar gratis). |
| Strava, adidas, n8n, app nativa | ⛔ Fuera del MVP. |

## Decisiones tomadas
- **Local-first con exportación estática**: sin servidor propio ni funciones; la seguridad en la nube la da RLS.
- **Ingreso por código de 6 dígitos** (no enlace mágico): en iPhone el enlace abre Safari, que no comparte datos con la app instalada.
- **Conflictos: last-write-wins por registro** (cliente y servidor). Un cambio local pendiente no se pisa con uno remoto más viejo.
- **Borrado lógico** (`deletedAt`) para que las eliminaciones se sincronicen.
- **Pasos de varias fuentes**: se toma el mayor del día, nunca la suma.
- **Tablas `fit_*`** para poder convivir en un proyecto Supabase existente sin chocar (ej. `profiles`).
- **Imágenes de ejercicios**: solo fotos propias; sin imágenes de terceros sin licencia.
- **Ícono provisorio** "LF": no es un logo aprobado de Lovely Fit.

## Infraestructura
- Supabase: tablas `fit_*` en un proyecto compartido, aisladas por RLS; no comparten tablas con otros sistemas.
- Sincronización probada a nivel de esquema y RLS; falta la prueba con cuenta real desde el iPhone.

## Pendientes de prueba (no bloquean)
- Salida de prueba con el DM58 y ver si GloryFitPro exporta el recorrido.
- Armar el Atajo en tu iPhone y verificar qué métricas devuelve Salud con el teléfono bloqueado/desbloqueado.
- Una semana completa de pasos reales → la app propone meta entre semana (no 10.000 por defecto).
- Instalar en iPhone y repetir el checklist de docs/QA.md.
- Alcohol, bebidas, alergias, porciones y creatina: pendientes; no bloquean el software.

## Roles de trabajo (cómo se organizó)
No se lanzaron agentes separados: un único agente cubrió los roles y verificó con pruebas. Responsabilidades documentadas:
- **Producto:** este documento (alcance, estado, pendientes, aceptación).
- **Diseño:** docs/DISENO.md, `app/globals.css`.
- **Aplicación/datos:** `lib/` (IndexedDB, sync, RLS en `supabase/`).
- **Integraciones:** docs/INTEGRACIONES.md, `lib/imports.ts`, `lib/gpx.ts` — pruebas reales pendientes en tu iPhone.
- **Calidad:** docs/QA.md, `tests/`.

## Criterios de aceptación de la primera entrega
- [x] Perfil editable · [x] rutina editable · [x] sesión de fuerza completa
- [x] comida, peso y cardio · [x] dashboard con datos reales · [x] guardado offline comprobado (Chromium)
- [x] marca aplicada · [x] instrucciones de instalación y pruebas · [x] integraciones/notificaciones con estado real
- [ ] verificación en iPhone real (pendiente, la hacés vos con docs/QA.md)
