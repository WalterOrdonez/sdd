# ADR-001 · Atomicidad: ACID cuando es local, Saga cuando es distribuido

- **Estado:** Aceptado
- **Invariante:** INV-3
- **Specs:** SPEC-001 (R8), SPEC-002 (R7, R9, R10)

## Contexto
Una transferencia debe ser todo o nada. Algunos casos ocurren íntegramente en la misma
base MySQL; otros cruzan recursos o servicios externos.

## Decisión
- Si todos los efectos ocurren en la misma base MySQL → **una transacción ACID** (`QueryRunner`).
- Si algún paso cruza a un recurso/servicio externo → **Saga con compensación** (ver ADR-005).

## Consecuencias
- (+) Simplicidad y consistencia fuerte en el caso local (SPEC-001).
- (+) Atomicidad lógica en el caso distribuido sin bloqueo global.
- (−) Dos caminos de implementación que mantener y testear.
