# ADR-002 · Control de concurrencia con bloqueo pesimista

- **Estado:** Aceptado
- **Invariante:** INV-1
- **Specs:** SPEC-001 (R7)

## Contexto
Dos transferencias simultáneas sobre la misma billetera no deben poder reservar más saldo
del disponible, o se produciría saldo negativo.

## Decisión
Usar **bloqueo pesimista** `SELECT ... FOR UPDATE` sobre la fila de la wallet origen al
momento de reservar el saldo, dentro de la transacción.

## Consecuencias
- (+) Garantía directa de que los holds se serializan; imposible exceder el disponible.
- (+) Sencillo de razonar frente a reintentos.
- (−) Menor concurrencia sobre wallets muy activas (contención en la fila).
- Alternativa descartada: bloqueo optimista con reintento (más complejo para este dominio).

## Notas de implementación (MySQL)
- Requiere motor **InnoDB** (soporta transacciones y bloqueo a nivel de fila).
- `SELECT ... FOR UPDATE` debe caer sobre la **PK indexada** de la wallet para que el
  bloqueo sea de fila y no de rango.
- Usar aislamiento `READ COMMITTED` o el default `REPEATABLE READ`; evitar lecturas del
  saldo fuera de la transacción que toma el lock.
