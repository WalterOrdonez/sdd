# TASKS · Wallet Transfers

> Secuencia de implementación con trazabilidad. Se ejecutan en orden (las dependencias
> fluyen hacia abajo). Cada task sigue el ciclo test-primero (RED → GREEN → REFACTOR).
> Refs: specs en `features/`, contratos en `contracts/openapi.yml`, decisiones en `adr/`.

Orden de ejecución:
T-00 → T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → **T-07 (cierra SPEC-001)** → T-08 → T-09 → T-10 → **T-11 (cierra SPEC-002)**

---

# T-00 · Bootstrap del servidor Express y manejo de errores
## Cobertura reglas
Transversal · (ADR-008) · Contrato `contracts/openapi.yml`
## Dependencias
Ninguna
## Definition of Done
- App Express con `express.json()` y arranque desacoplado (`app` exportable para Supertest).
- Middleware de errores que traduce códigos de dominio a HTTP (422 regla, 409 idempotencia,
  500 `INTERNAL`) usando el shape `ErrorResult` del contrato; sin exponer detalles internos.
- Lectura del header `Idempotency-Key`.
- Test de smoke (health + forma de error) con Supertest en RED→GREEN.
## Nombre de archivos
- `src/app.ts`
- `src/server.ts`
- `src/http/error-middleware.ts`
- `test/http/app.smoke.spec.ts`

---

# T-01 · Modelo de dominio y tipos de dinero
## Cobertura reglas
SPEC-001 R1; SPEC-002 R2 (base) · INV-6
## Dependencias
Ninguna
## Definition of Done
- `Currency` (USD|EUR|COP) y `Money {amountMinor:int, currency}` como enteros, sin float.
- Entidades `Wallet`, `Transfer` con estados del Event Storming.
- Tests unitarios de construcción/validación de `Money` en RED→GREEN.
## Nombre de archivos
- `src/domain/money.ts`
- `src/domain/wallet.entity.ts`
- `src/domain/transfer.entity.ts`
- `test/domain/money.spec.ts`

---

# T-02 · Validación de moneda ISO 4217
## Cobertura reglas
SPEC-001 R2; SPEC-002 R1 · INV-5 · (ADR-008)
## Dependencias
T-01
## Definition of Done
- Validador que acepta solo USD/EUR/COP en mayúsculas; rechaza símbolos, minúsculas, vacíos.
- Mapea a `UNSUPPORTED_CURRENCY`.
- Tests de casos válidos e inválidos en RED→GREEN.
## Nombre de archivos
- `src/domain/currency.validator.ts`
- `test/domain/currency.validator.spec.ts`

---

# T-03 · Libro contable (partida doble)
## Cobertura reglas
SPEC-001 R9,R10; SPEC-002 R8 · INV-4 · (ADR-007)
## Dependencias
T-01
## Definition of Done
- `LedgerEntry` append-only; registrar asientos ligados a `transferId`.
- Validación de suma neta == 0 antes de persistir (incluye contrapartida FX).
- Soporte de asientos de reverso.
- Tests de balance cero y de inmutabilidad en RED→GREEN.
## Nombre de archivos
- `src/domain/ledger.ts`
- `src/domain/ledger-entry.entity.ts`
- `test/domain/ledger.spec.ts`

---

# T-04 · Bloqueo y liberación de saldo (hold) con concurrencia
## Cobertura reglas
SPEC-001 R5,R6,R7 · INV-1 · (ADR-002)
## Dependencias
T-01
## Definition of Done
- `disponible = balance - locked`, nunca negativo.
- Bloquear/Liberar/Desbloquear; `INSUFFICIENT_FUNDS` si no alcanza.
- Bloqueo pesimista `SELECT ... FOR UPDATE`.
- Test de concurrencia: dos holds simultáneos no exceden el disponible (RED→GREEN).
## Nombre de archivos
- `src/domain/balance-lock.ts`
- `test/domain/balance-lock.concurrency.spec.ts`

---

# T-05 · Idempotencia por clave única
## Cobertura reglas
SPEC-001 R11,R12; SPEC-002 R11 · INV-1,INV-4 · (ADR-004)
## Dependencias
T-01
## Definition of Done
- Tabla `idempotency_keys` con `UNIQUE(key)`.
- Misma clave+payload → resultado original; misma clave+payload distinto → `IDEMPOTENCY_CONFLICT`.
- Test de reintento concurrente sin doble ejecución (RED→GREEN).
## Nombre de archivos
- `src/infra/idempotency.repository.ts`
- `test/infra/idempotency.spec.ts`

---

# T-06 · Transacción ACID (QueryRunner) y manejo de fallos/limpieza
## Cobertura reglas
SPEC-001 R8 · INV-3 · (ADR-001)
## Dependencias
T-03, T-04, T-05
## Definition of Done
- Envoltura transaccional con `QueryRunner` (commit/rollback).
- Fallo antes del commit → rollback total (sin saldos ni asientos).
- Test de atomicidad: fallo intermedio deja todo en estado inicial (RED→GREEN).
## Nombre de archivos
- `src/infra/unit-of-work.ts`
- `test/infra/unit-of-work.spec.ts`

---

# T-07 · Caso de uso: Transferencia misma moneda (cierra SPEC-001)
## Cobertura reglas
SPEC-001 R1–R12 · INV-1,3,4,5,6 · (ADR-001,002,003,004,008)
## Dependencias
T-00, T-02, T-06
## Definition of Done
- Ruta Express `POST /transfers` conforme a `openapi.yml`.
- Flujo completo del PLAN: validar → idempotencia → bloquear → asientos → debitar/acreditar → confirmar.
- Todos los escenarios del `.feature` de SPEC-001 en verde (unit + HTTP con Supertest).
- Ninguna invariante de SPEC-001 sin test.
## Nombre de archivos
- `src/application/transfer.usecase.ts`
- `src/routes/transfer.route.ts`
- `test/application/transfer.usecase.spec.ts`
- `test/http/transfer.e2e.spec.ts`

---

# T-08 · FxQuote: congelamiento y vigencia (≤ 60s)
## Cobertura reglas
SPEC-002 R4,R6 · INV-2 · (ADR-006)
## Dependencias
T-01, T-02
## Definition of Done
- `POST /fx-quotes` emite quote con `issuedAt/expiresAt` (reloj servidor, ≤ 60000ms).
- Evaluación de vigencia; expirada → `QUOTE_EXPIRED`, sin recotizar.
- Tests de borde 59s pasa / 61s falla (RED→GREEN).
## Nombre de archivos
- `src/domain/fx-quote.ts`
- `src/routes/fx-quote.route.ts`
- `test/domain/fx-quote.spec.ts`

---

# T-09 · Conversión de montos con redondeo FX
## Cobertura reglas
SPEC-002 R5,R8 · INV-4,INV-6 · (ADR-007)
## Dependencias
T-03, T-08
## Definition of Done
- `creditedMinor = round(amountMinor * rate)` half-up; residuo a cuenta FX.
- Asientos de conversión suman cero.
- Tests de redondeo y de balance cero (RED→GREEN).
## Nombre de archivos
- `src/domain/fx-conversion.ts`
- `test/domain/fx-conversion.spec.ts`

---

# T-10 · Orquestación saga y compensación
## Cobertura reglas
SPEC-002 R7,R9,R10 · INV-3 · (ADR-005)
## Dependencias
T-04, T-09
## Definition of Done
- Cada paso con compensación idempotente; fallo → compensar en orden inverso → `COMPENSADA`.
- Compensación imposible → `FALLIDA` + registro para intervención.
- Tests de fallo tras debitar y de compensación imposible (RED→GREEN).
## Nombre de archivos
- `src/application/transfer-saga.ts`
- `test/application/transfer-saga.spec.ts`

---

# T-11 · Caso de uso: Transferencia con conversión (cierra SPEC-002)
## Cobertura reglas
SPEC-002 R1–R11 · INV-1,2,3,4,5,6 · (ADR-001,003,004,005,006,007,008)
## Dependencias
T-07, T-10
## Definition of Done
- Ruta Express `POST /fx-transfers` conforme a `openapi.yml`.
- Flujo completo del PLAN (con quote, conversión y saga).
- Todos los escenarios del `.feature` de SPEC-002 en verde (unit + HTTP con Supertest).
- Ninguna invariante de SPEC-002 sin test.
## Nombre de archivos
- `src/application/fx-transfer.usecase.ts`
- `src/routes/fx-transfer.route.ts`
- `test/application/fx-transfer.usecase.spec.ts`
- `test/http/fx-transfer.e2e.spec.ts`
