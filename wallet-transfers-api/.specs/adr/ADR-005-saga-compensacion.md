# ADR-005 · Saga con compensaciones idempotentes en orden inverso

- **Estado:** Aceptado
- **Invariante:** INV-3, INV-1, INV-4
- **Specs:** SPEC-002 (R9, R10)

## Contexto
Cuando una transferencia cruza recursos externos no se puede usar una sola transacción
ACID. Hace falta garantizar el "todo o nada" de forma distribuida (ver ADR-001).

## Decisión
Modelar la operación como **saga**: cada paso (congelar, bloquear, contabilizar, debitar,
acreditar) define su **acción compensatoria idempotente**. Ante un fallo en el paso N, se
ejecutan las compensaciones de N-1 … 1 en **orden inverso**. Si una compensación no puede
completarse, la transferencia queda `FALLIDA` y se registra para intervención; nunca queda
en estado parcial silencioso.

## Consecuencias
- (+) Atomicidad lógica sin transacción distribuida.
- (+) Las compensaciones idempotentes toleran reintentos.
- (−) Más estados y rutas de error que mantener y testear.
- (−) Requiere monitoreo para los casos `FALLIDA` que necesitan intervención.
