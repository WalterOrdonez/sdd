# ADR-003 · El dinero se representa como enteros (menor unidad)

- **Estado:** Aceptado
- **Invariante:** INV-6
- **Specs:** SPEC-001 (R1), SPEC-002 (R2, R5)

## Contexto
Los montos con `float` acumulan errores de redondeo que romperían la partida doble (INV-4)
y producirían diferencias de centavos.

## Decisión
Representar todo monto como **entero en la menor unidad** (`amountMinor`), acompañado
siempre de su moneda. Prohibido `float`/`number` decimal para dinero. La validación de que
el monto es entero y positivo ocurre en el borde (handler).

## Consecuencias
- (+) Aritmética exacta; la partida doble cierra sin residuos inesperados.
- (+) Contrato explícito (`amountMinor`) difícil de malinterpretar.
- (−) Obliga a conocer el exponent ISO 4217 por moneda para formatear en UI.

## Notas de implementación (MySQL)
- Persistir `amountMinor` como **`BIGINT`** (no `DECIMAL` ni `FLOAT`).
- TypeORM mapea `bigint` a **`string`** en JS por precisión; el dominio debe operar con
  enteros seguros (p. ej. `BigInt`) y nunca reconvertir a `number` decimal.
- `UNSIGNED` solo en columnas que no admiten negativos (p. ej. `balance`); los asientos del
  ledger llevan signo, así que van con `BIGINT` con signo.
