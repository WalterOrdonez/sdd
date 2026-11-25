# Plan · SPEC-002 · Transferencia entre billeteras con conversión de moneda

## Contrato (API)
Definido en [`../contracts/openapi.yml`](../contracts/openapi.yml):
- `POST /fx-transfers` → `FxTransferRequest` / `FxTransferResult`
- `POST /fx-quotes` → `FxQuote`
- Errores → `ErrorResult`

## Flujo

Orquestado como saga con compensación (ADR-001, ADR-005).

```
1. Validar entrada           (R1,R2,R3)     → si falla: Rechazada
2. Resolver idempotencia      (R11)          → si repetida: devuelve resultado original
3. Verificar vigencia de tasa (R4,R6)        → si expiró: QUOTE_EXPIRED
4. Calcular conversión         (R5)           → creditedMinor = round(amount*rate) (ADR-007)
5. Bloquear saldo origen      (R3)           → SaldoBloqueado / si no: INSUFFICIENT_FUNDS
6. Registrar asientos + FX     (R8)           → AsientosContablesRegistrados (suma 0)
7. Debitar origen / Acreditar destino         → SaldoDebitado, SaldoAcreditado
8. Liberar hold y confirmar   (R7)           → SaldoLiberado → COMPLETADA
```

Rama de fallo (R9,R10): ante un error se ejecutan las compensaciones de los pasos ya
aplicados en orden inverso (desbloquear saldo, reversar asientos) → COMPENSADA.
Si una compensación no se puede completar → FALLIDA (registrada para intervención).

### Concurrencia y conflictos
- Bloqueo pesimista sobre la wallet origen (ADR-002): los holds se serializan. _(R3, INV-1)_
- Vigencia de tasa evaluada contra el reloj del servidor justo antes de ejecutar
  (ADR-006): dos solicitudes sobre la misma quote cerca del límite se resuelven de forma
  determinista (una pasa, la otra `QUOTE_EXPIRED`). _(R4, R6)_
- Idempotencia con `UNIQUE(key)` (ADR-004): un reintento no vuelve a congelar tasa ni
  debitar; devuelve el resultado original. _(R11)_

### Fallos y limpieza
- Fallo dentro de una misma base MySQL → `ROLLBACK` (ADR-001).
- Fallo cruzando recursos → **saga**: compensaciones idempotentes en orden inverso (ADR-005).
- Compensación imposible → estado `FALLIDA` + registro para intervención (no se auto-limpia).
- Quotes expiradas y claves de idempotencia se purgan por job de limpieza tras su ventana.

## Errores (mapeo regla → código)

| Regla | Condición                          | Código                 |
|-------|------------------------------------|------------------------|
| R1    | Monedas iguales                    | `CURRENCY_MISMATCH`    |
| R1    | Moneda no soportada                | `UNSUPPORTED_CURRENCY` |
| R2    | Monto ≤ 0 o no entero               | `INVALID_AMOUNT`       |
| R3    | Saldo disponible insuficiente       | `INSUFFICIENT_FUNDS`   |
| R4/R6 | Quote con vigencia > 60s o expirada | `QUOTE_EXPIRED`        |
| R11   | Misma clave, distinto payload       | `IDEMPOTENCY_CONFLICT` |
| —     | Error no clasificado (fail-closed)  | `INTERNAL`             |

## Decisiones técnicas (ADR)

| Decisión                          | ADR                                                        | Regla   |
|-----------------------------------|------------------------------------------------------------|---------|
| Atomicidad (ACID o Saga)          | [ADR-001](../adr/ADR-001-atomicidad-acid-saga.md)          | R7      |
| Dinero como enteros               | [ADR-003](../adr/ADR-003-dinero-como-enteros.md)           | R2, R5  |
| Vigencia de tasa (reloj servidor) | [ADR-006](../adr/ADR-006-vigencia-tasa-reloj-servidor.md)  | R4, R6  |
| Redondeo FX (half-up + cuenta FX) | [ADR-007](../adr/ADR-007-redondeo-fx.md)                   | R5, R8  |
| Saga y compensación               | [ADR-005](../adr/ADR-005-saga-compensacion.md)             | R9, R10 |
| Idempotencia (clave única)        | [ADR-004](../adr/ADR-004-idempotencia-clave-unica.md)      | R11     |
| Orden de validaciones fail-fast   | [ADR-008](../adr/ADR-008-orden-validaciones.md)            | R1→R4   |
