# ADR-007 · Redondeo half-up con residuo en cuenta FX

- **Estado:** Aceptado
- **Invariante:** INV-4, INV-6
- **Specs:** SPEC-002 (R5, R8)

## Contexto
Al convertir montos enteros con una tasa, el resultado casi nunca es exacto. Si el residuo
no se contabiliza, la partida doble (INV-4) no cerraría en cero.

## Decisión
`creditedMinor = round(amountMinor * rate)` con política de redondeo **half-up explícita y
fija**. El residuo del redondeo se asienta en una **cuenta de cambio (FX)**, de modo que la
suma neta de los asientos sea exactamente 0. La suma se valida antes del commit.

## Consecuencias
- (+) La partida doble cierra siempre, incluso con conversiones no exactas.
- (+) Política de redondeo única y predecible en todo el sistema.
- (−) Requiere mantener cuentas FX en el plan contable.
