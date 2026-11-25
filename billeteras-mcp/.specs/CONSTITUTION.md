# CONSTITUTION.md

> Proyecto: **Wallet Transfers** · Versión: **2.0.0** · Metodología: **Spec-Driven Development**

---

## Stack permitido

- **Backend:** NodeJS, TypeScript (`strict: true`)
- **API:** Express (un controlador por caso de uso; handlers finos, dominio puro testeable)
- **Datos:** TypeORM sobre MySQL (transacciones vía `QueryRunner`)
- **Testing:** Jest (unit/integración), Supertest (HTTP)
- **Frontend:** Angular 16, TypeScript

---

## Principios no negociables (invariantes críticas)

- **INV-1 · Billetera sin negativos.** Una billetera jamás queda en negativo. Si
  no hay saldo disponible suficiente, la transferencia se rechaza con `INSUFFICIENT_FUNDS`.

- **INV-2 · El precio del cambio dura máximo 60 segundos.** Al convertir monedas se usa una
  tasa congelada. Si pasaron más de 60 segundos, la operación se rechaza con `QUOTE_EXPIRED`;
  nunca se cambia la tasa sin avisar.

- **INV-3 · La transferencia atomica.** Nunca quedan trasacciones incompletas. Si algo
  falla, se revierte la operación, para dejar en estado inicial.

- **INV-4 · Las cuentas siempre cuadran.** Cada transferencia deja registros contables que
  sumados dan exactamente cero (partida doble).

- **INV-5 · Las monedas se escriben en código de 3 letras.** Solo se aceptan `USD`, `EUR` y
  `COP`. Cualquier otra cosa (símbolos, nombres, códigos raros) se rechaza con
  `UNSUPPORTED_CURRENCY`.

- **INV-6 · El dinero se guarda en números enteros.** Siempre en la unidad más pequeña
  (centavos) y acompañado de su moneda. Nunca se usan decimales que puedan perder precisión.

---

## Definición de terminado (Definition of Done)

Una feature está terminada **solo si cumple TODO lo siguiente**:

1. Existe una **spec** aprobada (Given/When/Then) antes del código.
2. Se aplicó **test primero**: el test se escribió y falló (RED) antes de la
   implementación (GREEN → REFACTOR). El PR lo evidencia.
3. Todas las specs de la feature están cubiertas por **tests verdes** en Jest.
4. **Ninguna invariante (INV-1..6) quedó sin un test que la proteja.**
5. El PR declara qué invariantes toca y cómo las protege.
6. No se usa `float` para dinero, monedas en ISO 4217, sin estado parcial.
