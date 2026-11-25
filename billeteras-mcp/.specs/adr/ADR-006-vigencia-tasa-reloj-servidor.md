# ADR-006 · Vigencia de la tasa medida contra el reloj del servidor

- **Estado:** Aceptado
- **Invariante:** INV-2
- **Specs:** SPEC-002 (R4, R6)

## Contexto
La tasa de cambio debe congelarse por un máximo de 60 segundos. Si la vigencia dependiera
del reloj del cliente, podría manipularse o desfasarse.

## Decisión
La `FxQuote` lleva `issuedAt` y `expiresAt` calculados con el **reloj del servidor**
(fuente de tiempo única), con `expiresAt - issuedAt <= 60000 ms`. Justo antes de ejecutar
se valida `now <= expiresAt`. Si expiró → `QUOTE_EXPIRED`; la tasa **no** se recotiza sola.

## Consecuencias
- (+) Vigencia no manipulable desde el cliente.
- (+) Comportamiento determinista y testeable (boundary 59s/61s).
- (−) Sensible al reloj del servidor; requiere sincronización (NTP) en producción.
