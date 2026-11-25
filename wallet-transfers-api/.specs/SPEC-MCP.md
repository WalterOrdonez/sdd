# .specs/SPEC-MCP.md

## Objetivo

Permitir que un agente opere billeteras sin violar las invariantes de features/SPEC-001-transferencia-misma-moneda.md y features/SPEC-002-transferencia-conversion-moneda.md

## Reglas

R1. Ninguna tool deja una billetera en negativo.
R2. Toda transferencia usa una cotización < 60 s.
R3. crear_transferencia es idempotente.
