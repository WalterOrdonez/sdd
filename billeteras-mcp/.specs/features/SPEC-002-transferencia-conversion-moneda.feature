# Aclaración de escenarios · SPEC-002 · Transferencia entre billeteras con conversión de moneda

> Documento de aclaración. Cada escenario referencia la regla de negocio (Rn) de la spec.
> Contexto: "W-USD" activa en USD con 10000 centavos; "W-COP" activa en COP con 0 centavos.
> Tasa de referencia: 1 USD = 4000 COP (congelada en una FxQuote vigente).

Escenario: Transferencia con conversión exitosa (R1, R4, R5, R7, R8)
    Dado una FxQuote vigente de USD a COP con tasa 4000
    Cuando solicito transferir 3000 centavos de "W-USD" a "W-COP" usando esa tasa
    Entonces la transferencia queda "COMPLETADA"
    Y el saldo disponible de "W-USD" es 7000 centavos
    Y el saldo disponible de "W-COP" es 12000000 centavos
    Y se registran asientos contables, con contrapartida FX, cuya suma neta es 0

Escenario: Rechazo cuando las monedas son iguales (R1)
    Dado una billetera origen y una destino ambas en "USD"
    Cuando solicito una transferencia con conversión entre ellas
    Entonces la transferencia es rechazada con código "CURRENCY_MISMATCH"
    Y ningún saldo cambia

Escenario: Rechazo cuando una moneda no está soportada (R1)
    Dado una billetera destino en una moneda fuera de USD, EUR, COP
    Cuando solicito transferir 3000 centavos de "W-USD" a esa billetera
    Entonces la transferencia es rechazada con código "UNSUPPORTED_CURRENCY"
    Y ningún saldo cambia

Escenario: Rechazo por monto no positivo (R2)
    Dado una FxQuote vigente de USD a COP
    Cuando solicito transferir un monto menor o igual a 0 centavos
    Entonces la transferencia es rechazada con código "INVALID_AMOUNT"
    Y ningún saldo cambia

Escenario: Rechazo por saldo insuficiente (R3)
    Dado una billetera origen "W-USD" con saldo disponible de 10000 centavos
    Cuando solicito transferir 15000 centavos de "W-USD" a "W-COP"
    Entonces la transferencia es rechazada con código "INSUFFICIENT_FUNDS"
    Y el saldo disponible de "W-USD" es 10000 centavos
    Y el saldo disponible de "W-COP" es 0 centavos

Escenario: La tasa se usa dentro de la ventana de 60 segundos (R4)
    Dado una FxQuote de USD a COP emitida hace 59 segundos
    Cuando solicito transferir 3000 centavos de "W-USD" a "W-COP" usando esa tasa
    Entonces la transferencia queda "COMPLETADA"

Escenario: Rechazo cuando la tasa expiró (R6)
    Dado una FxQuote de USD a COP emitida hace 61 segundos
    Cuando solicito transferir 3000 centavos de "W-USD" a "W-COP" usando esa tasa
    Entonces la transferencia es rechazada con código "QUOTE_EXPIRED"
    Y ningún saldo cambia
    Y la tasa no se renueva automáticamente

Escenario: Fallo tras debitar dispara compensación en orden inverso (R7, R9)
    Dado una FxQuote vigente de USD a COP con tasa 4000
    Y que el acreditar en destino fallara luego de debitar en origen
    Cuando solicito transferir 3000 centavos de "W-USD" a "W-COP"
    Entonces se compensan los pasos ya aplicados en orden inverso
    Y el saldo disponible de "W-USD" vuelve a 10000 centavos
    Y la transferencia queda "COMPENSADA"

Escenario: Compensación imposible deja la transferencia como fallida (R10)
    Dado una transferencia con conversión cuyo paso de compensación no puede completarse
    Cuando ocurre el fallo
    Entonces la transferencia queda "FALLIDA"
    Y el caso se registra para intervención
    Y nunca queda en un estado parcial silencioso

Escenario: Reintento con la misma Idempotency-Key no duplica la operación (R11)
    Dado que ya solicité transferir 3000 centavos de "W-USD" a "W-COP" con la clave "KEY-1"
    Cuando vuelvo a solicitar la misma transferencia con la clave "KEY-1"
    Entonces se devuelve el resultado de la transferencia original
    Y no se vuelve a congelar la tasa ni a debitar
    Y existe un único conjunto de asientos contables para esa transferencia
