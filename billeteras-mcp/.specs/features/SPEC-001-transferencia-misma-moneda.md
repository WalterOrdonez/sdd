# Feature: Transferencia entre billeteras de la misma moneda (SPEC-001)

## Contexto y objetivo
Mover fondos entre dos billeteras de la misma moneda, sin conversión. Caso base del sistema.
Incluye validación de moneda, bloqueo de saldo, registro contable de partida doble e idempotencia.

## Historia
Como titular de una billetera quiero transferir dinero a otra billetera de la misma moneda para enviar fondos sin gastar más de lo que tengo.

## Reglas de negocio

### Validación de entrada
R1. El monto es entero, en la menor unidad, y mayor que cero; si no, `INVALID_AMOUNT`. _(INV-6)_
R2. La moneda es un código ISO 4217 soportado (USD, EUR, COP); si no, `UNSUPPORTED_CURRENCY`. _(INV-5)_
R3. Origen y destino existen, están activos y son distintos; si no, `WALLET_NOT_FOUND` / `SAME_WALLET`.
R4. Ambas billeteras tienen la misma moneda; si difieren, `CURRENCY_MISMATCH`. _(INV-5)_

### Bloqueo de saldo
R5. Disponible = `balance - locked`, nunca negativo. _(INV-1)_
R6. Solo procede si `disponible >= monto`; si no, `INSUFFICIENT_FUNDS` y nada cambia. _(INV-1)_
R7. Bajo concurrencia los bloqueos se serializan; los holds no exceden el disponible. _(INV-1)_

### Atomicidad y contabilidad
R8. La operación es atómica: todo o nada; ante fallo intermedio se revierte. _(INV-3)_
R9. Genera asientos de partida doble que suman cero. _(INV-4)_
R10. Los asientos son inmutables y append-only; se corrigen con reversos. _(INV-4)_

### Idempotencia
R11. Es idempotente por `Idempotency-Key`: un reintento devuelve el resultado original sin duplicar. _(INV-1, INV-4)_
R12. Misma clave con distinto payload → `IDEMPOTENCY_CONFLICT`.
