# Plan · SPEC-001 · Transferencia entre billeteras de la misma moneda

## Contrato (API)
Definido en [`../contracts/openapi.yml`](../contracts/openapi.yml):
- `POST /transfers` → `TransferRequest` / `TransferResult`
- Errores → `ErrorResult`

## Flujo

Todo dentro de una única transacción ACID (ADR-001).

```
1. Validar entrada          (R1,R2,R3,R4)  → si falla: Rechazada
2. Resolver idempotencia     (R11,R12)      → si repetida: devuelve resultado original
3. Bloquear saldo origen     (R5,R6,R7)     → SaldoBloqueado / si no: INSUFFICIENT_FUNDS
4. Registrar asientos         (R9,R10)       → AsientosContablesRegistrados (suma 0)
5. Debitar origen / Acreditar destino        → SaldoDebitado, SaldoAcreditado
6. Liberar hold y confirmar  (R8)           → SaldoLiberado → COMPLETADA
```

Rama de fallo: cualquier error antes del commit revierte la transacción completa
(ningún saldo cambia, ningún asiento queda) → Rechazada / FALLIDA.

### Concurrencia y conflictos
- Bloqueo pesimista `SELECT ... FOR UPDATE` sobre la wallet origen (ADR-002): dos débitos
  simultáneos se serializan; la suma de holds nunca excede el disponible. _(R7, INV-1)_
- Idempotencia con `UNIQUE(key)` (ADR-004): dos reintentos con la misma clave compiten por
  el insert; el perdedor devuelve el resultado del ganador, no re-ejecuta. _(R11)_
- Misma clave con distinto payload → `IDEMPOTENCY_CONFLICT`. _(R12)_

### Fallos y limpieza
- Error antes del commit → `ROLLBACK` (la base revierte todo; nada que limpiar a mano).
- Error al liberar hold tras commit → reintento idempotente de la liberación.
- Claves de idempotencia se purgan tras su ventana de retención (job de limpieza).

## Errores (mapeo regla → código)

| Regla | Condición                              | Código                 |
|-------|----------------------------------------|------------------------|
| R1    | Monto ≤ 0 o no entero                   | `INVALID_AMOUNT`       |
| R2    | Moneda no soportada / no ISO 4217       | `UNSUPPORTED_CURRENCY` |
| R3    | Billetera inexistente                   | `WALLET_NOT_FOUND`     |
| R3    | Origen == destino                       | `SAME_WALLET`          |
| R4    | Monedas de origen y destino difieren    | `CURRENCY_MISMATCH`    |
| R6    | Saldo disponible insuficiente           | `INSUFFICIENT_FUNDS`   |
| R11   | Misma clave, distinto payload           | `IDEMPOTENCY_CONFLICT` |
| —     | Error no clasificado (fail-closed)      | `INTERNAL`             |

## Decisiones técnicas (ADR)

| Decisión                          | ADR                                                        | Regla  |
|-----------------------------------|------------------------------------------------------------|--------|
| Atomicidad (ACID local)           | [ADR-001](../adr/ADR-001-atomicidad-acid-saga.md)          | R8     |
| Concurrencia (bloqueo pesimista)  | [ADR-002](../adr/ADR-002-concurrencia-bloqueo-pesimista.md)| R7     |
| Dinero como enteros               | [ADR-003](../adr/ADR-003-dinero-como-enteros.md)           | R1     |
| Idempotencia (clave única)        | [ADR-004](../adr/ADR-004-idempotencia-clave-unica.md)      | R11,R12|
| Orden de validaciones fail-fast   | [ADR-008](../adr/ADR-008-orden-validaciones.md)            | R1→R6  |
