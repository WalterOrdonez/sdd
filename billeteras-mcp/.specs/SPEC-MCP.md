# .specs/SPEC-MCP.md

## Objetivo

Permitir que un agente opere billeteras sin violar las invariantes de features/SPEC-001-transferencia-misma-moneda.md y features/SPEC-002-transferencia-conversion-moneda.md

## Reglas

R1. Ninguna tool deja una billetera en negativo.
R2. Toda transferencia usa una cotización < 60 s.
R3. crear_transferencia es idempotente.

## Integración local

Las tools `crear_transferencia` (misma moneda) y `crear_transferencia_con_conversion` (requiere
`cotizacionId` de `cotizar`) ejecutan transferencias en la API y exigen `idempotencyKey`, que se
envía como header `Idempotency-Key`. No recotizan automáticamente si la cotización expira.

Las tools `consultar_saldo` y `cotizar` consultan Wallet Transfers API en
`http://localhost:3000` por defecto. Configure `WALLET_TRANSFERS_API_URL` para cambiar la URL.
La API devuelve los saldos y calcula `estimatedAmountMinor` usando su misma regla de conversión
que aplica al ejecutar una transferencia FX.
