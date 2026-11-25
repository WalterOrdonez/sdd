# Feature: Transferencia entre billeteras con conversión de moneda (SPEC-002)

## Contexto y objetivo
Mover fondos entre billeteras de monedas distintas aplicando una tasa congelada y vigente.
Incluye congelamiento de tasa (≤ 60s) y compensación tipo saga ante fallo. Reusa las reglas base de SPEC-001.

## Historia
Como titular de una billetera quiero transferir fondos a una billetera en otra moneda para enviar dinero con una tasa clara y fija.

## Reglas de negocio

### Aplicabilidad y validación
R1. Aplica solo cuando las monedas difieren y ambas están soportadas (ISO 4217). _(INV-5)_
R2. El monto es entero, en la menor unidad, y mayor que cero. _(INV-6)_
R3. Solo procede con saldo disponible suficiente en origen; si no, `INSUFFICIENT_FUNDS`. _(INV-1)_

### Congelamiento de tasa (FxQuote)
R4. Requiere una tasa congelada con vigencia máxima de 60s, medida contra el reloj del servidor. _(INV-2)_
R5. La tasa es positiva; débito y crédito se calculan con ella, cada uno entero en su moneda. _(INV-2, INV-6)_
R6. Si la tasa expiró al ejecutar, `QUOTE_EXPIRED` y nada cambia; no se renueva sola. _(INV-2)_

### Atomicidad, contabilidad y saga
R7. La operación es atómica: todo o nada. _(INV-3)_
R8. Los asientos suman cero incluyendo la contrapartida en cuentas FX. _(INV-4)_
R9. Ante fallo, cada paso se compensa en orden inverso (saga); los saldos vuelven al estado previo. _(INV-1, INV-3)_
R10. Si no se puede compensar, la transferencia queda `FALLIDA`; nunca en estado parcial silencioso. _(INV-3)_

### Idempotencia
R11. Es idempotente por `Idempotency-Key`: un reintento no vuelve a congelar tasa, debitar ni duplicar asientos. _(INV-4)_
