# ADR-008 · Orden de validaciones fail-fast (barato a caro)

- **Estado:** Aceptado
- **Invariante:** —
- **Specs:** SPEC-001 (orden R1→R2→R3→R4→R6), SPEC-002 (R1→R2→R3→R4)

## Contexto
Las validaciones tienen costos distintos: comparar un monto es barato; buscar wallets o
congelar/verificar una tasa implica ir a la base o a otro servicio.

## Decisión
Validar en orden **de lo más barato a lo más caro**, haciendo fail-fast en el primer
incumplimiento:
- SPEC-001: monto → moneda → existencia/igualdad de wallets → misma moneda → saldo.
- SPEC-002: monedas aplicables → monto → saldo → vigencia de tasa → ejecución.

## Consecuencias
- (+) Menos trabajo desperdiciado ante solicitudes inválidas.
- (+) Errores predecibles y consistentes.
- (−) El orden debe respetarse en la implementación y en los tests.
