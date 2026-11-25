# Aclaración de escenarios · SPEC-001 · Transferencia entre billeteras de la misma moneda

> Documento de aclaración. Cada escenario referencia la regla de negocio (Rn) de la spec.
> Contexto: "W-ORIGEN" activa en USD con 10000 centavos; "W-DESTINO" activa en USD con 0 centavos.

Escenario: Transferencia exitosa (R4, R5, R6)
    Dado una billetera origen con saldo disponible suficiente y una destino en la misma moneda
    Cuando solicito transferir 3000 centavos de "W-ORIGEN" a "W-DESTINO"
    Entonces la transferencia queda "COMPLETADA"
    Y el saldo disponible de "W-ORIGEN" es 7000 centavos
    Y el saldo disponible de "W-DESTINO" es 3000 centavos
    Y se registran asientos contables cuya suma neta es 0

Escenario: Rechazo por monto no positivo (R1)
    Dado una billetera origen y una destino válidas
    Cuando solicito transferir un monto menor o igual a 0 centavos
    Entonces la transferencia es rechazada con código "INVALID_AMOUNT"
    Y ningún saldo cambia

Escenario: Rechazo cuando origen y destino son la misma billetera (R2)
    Dado una billetera origen válida
    Cuando solicito transferir 1000 centavos de "W-ORIGEN" a "W-ORIGEN"
    Entonces la transferencia es rechazada con código "SAME_WALLET"
    Y ningún saldo cambia

Escenario: Rechazo cuando la billetera destino no existe (R2)
    Dado una billetera origen válida
    Cuando solicito transferir 1000 centavos de "W-ORIGEN" a "W-INEXISTENTE"
    Entonces la transferencia es rechazada con código "WALLET_NOT_FOUND"
    Y ningún saldo cambia

Escenario: Rechazo cuando las billeteras tienen distinta moneda (R3)
    Dado una billetera origen en "USD" y una billetera destino en "EUR"
    Cuando solicito transferir 1000 centavos de "W-ORIGEN" a "W-EUR"
    Entonces la transferencia es rechazada con código "CURRENCY_MISMATCH"
    Y ningún saldo cambia

Escenario: Rechazo por saldo insuficiente (R4)
    Dado una billetera origen con saldo disponible de 10000 centavos
    Cuando solicito transferir 15000 centavos de "W-ORIGEN" a "W-DESTINO"
    Entonces la transferencia es rechazada con código "INSUFFICIENT_FUNDS"
    Y el saldo disponible de "W-ORIGEN" es 10000 centavos
    Y el saldo disponible de "W-DESTINO" es 0 centavos

Escenario: Un fallo no mueve ningún saldo (R5)
    Dado que el registro de asientos contables fallara
    Cuando solicito transferir 3000 centavos de "W-ORIGEN" a "W-DESTINO"
    Entonces la transferencia queda "FALLIDA"
    Y el saldo disponible de "W-ORIGEN" es 10000 centavos
    Y el saldo disponible de "W-DESTINO" es 0 centavos
    Y no existe ningún asiento contable para esa transferencia

Escenario: Reintento con la misma Idempotency-Key no duplica la operación (R7)
    Dado que ya solicité transferir 3000 centavos de "W-ORIGEN" a "W-DESTINO" con la clave "KEY-1"
    Cuando vuelvo a solicitar la misma transferencia con la clave "KEY-1"
    Entonces se devuelve el resultado de la transferencia original
    Y el saldo disponible de "W-ORIGEN" es 7000 centavos
    Y existe un único conjunto de asientos contables para esa transferencia
