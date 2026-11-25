# ADR-004 · Idempotencia por clave con restricción única

- **Estado:** Aceptado
- **Invariante:** INV-1, INV-4
- **Specs:** SPEC-001 (R11, R12), SPEC-002 (R11)

## Contexto
Reintentos por timeouts o reenvíos no deben duplicar movimientos ni asientos. La operación
debe comportarse como "exactamente una vez".

## Decisión
Tabla `idempotency_keys` con `UNIQUE(key)`. La clave se consulta/inserta **dentro de la
misma transacción** que ejecuta la transferencia. Misma clave + mismo payload → se devuelve
el resultado original; misma clave + payload distinto → `IDEMPOTENCY_CONFLICT`.

## Consecuencias
- (+) Garantía de una sola ejecución incluso con reintentos concurrentes.
- (+) Simple y apoyado en la base de datos (sin infraestructura extra).
- (−) Requiere definir una ventana de retención para limpiar claves viejas.
