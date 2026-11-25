# EVENT STORMING · Wallet Transfers

> Descubrimiento del dominio mediante eventos de negocio.
> **Convenciones:** eventos en **español**, en **tiempo pasado** (son hechos ya ocurridos,
> inmutables) y en **PascalCase**.

---

## 1. Eventos de dominio

### Flujo principal (happy path)
| Evento                          | Significado                                                        | Invariante |
|---------------------------------|--------------------------------------------------------------------|-----------|
| `TransferenciaSolicitada`       | Alguien pidió mover fondos de una billetera a otra.                | —         |
| `TasaCongelada`                 | Se fijó la tasa de cambio para esta operación (vigencia ≤ 60s).    | INV-2     |
| `SaldoBloqueado`                | Se reservó el monto en la billetera origen (hold).                 | INV-1     |
| `AsientosContablesRegistrados`  | Se escribieron los asientos de partida doble (suman cero).         | INV-4     |
| `SaldoDebitado`                 | Salió el dinero de la billetera origen.                            | INV-1     |
| `SaldoAcreditado`               | Entró el dinero a la billetera destino.                            | INV-4     |
| `SaldoLiberado`                 | Se liberó el hold tras confirmar la operación.                     | INV-1     |
| `TransferenciaCompletada`       | La transferencia terminó con éxito (estado final).                 | INV-3     |

### Flujo de rechazo / fallo (sad path)
| Evento                          | Significado                                                        | Invariante |
|---------------------------------|--------------------------------------------------------------------|-----------|
| `TransferenciaRechazada`        | La solicitud no cumplió las validaciones (motivo adjunto).         | —         |
| `SaldoInsuficienteDetectado`    | No había saldo disponible suficiente en origen.                    | INV-1     |
| `TasaExpirada`                  | La tasa congelada superó los 60s antes de confirmar.               | INV-2     |
| `MonedaNoSoportadaDetectada`    | Se recibió una moneda fuera de `USD/EUR/COP` (no ISO 4217).        | INV-5     |

### Flujo de compensación (Saga — revertir lo parcial)
| Evento                          | Significado                                                        | Invariante |
|---------------------------------|--------------------------------------------------------------------|-----------|
| `SaldoDesbloqueado`             | Se revirtió el hold porque la operación no prosperó.               | INV-1/3   |
| `AsientosContablesReversados`   | Se emitieron asientos de reverso para anular los previos.          | INV-4     |
| `TransferenciaCompensada`       | La saga revirtió todos los efectos; estado consistente restaurado.| INV-3     |
| `TransferenciaFallida`          | La operación terminó en error definitivo (estado final).          | INV-3     |

---

## 2. Comandos (intención / disparador)

Cada comando, al ejecutarse con éxito, produce uno o más eventos.

| Comando                    | Evento(s) resultante(s)                              |
|----------------------------|------------------------------------------------------|
| `SolicitarTransferencia`   | `TransferenciaSolicitada` / `TransferenciaRechazada` |
| `CongelarTasa`             | `TasaCongelada`                                      |
| `BloquearSaldo`            | `SaldoBloqueado` / `SaldoInsuficienteDetectado`      |
| `RegistrarAsientos`        | `AsientosContablesRegistrados`                       |
| `ConfirmarTransferencia`   | `SaldoDebitado`, `SaldoAcreditado`, `SaldoLiberado`, `TransferenciaCompletada` |
| `CancelarTransferencia`    | `SaldoDesbloqueado`, `AsientosContablesReversados`, `TransferenciaCompensada`  |

---

## 3. Agregados (consistencia transaccional)

| Agregado        | Responsabilidad                                            | Protege   |
|-----------------|------------------------------------------------------------|-----------|
| `Wallet`        | Saldo, hold y disponibilidad. Autoriza débitos/créditos.   | INV-1, 6  |
| `Transfer`      | Ciclo de vida de la transferencia y orquestación de la saga.| INV-3     |
| `FxQuote`       | Tasa congelada y su vigencia (≤ 60s).                      | INV-2     |
| `Ledger`        | Asientos contables inmutables (append-only).               | INV-4     |

---

## 4. Políticas / Process Managers (reglas reactivas)

> "Cuando ocurre X, entonces dispará Y."

| Cuando ocurre…                 | …la política dispara…            |
|--------------------------------|----------------------------------|
| `TransferenciaSolicitada` (con cambio de moneda) | `CongelarTasa`     |
| `TasaCongelada`                | `BloquearSaldo`                  |
| `SaldoBloqueado`               | `RegistrarAsientos`              |
| `AsientosContablesRegistrados` | `ConfirmarTransferencia`         |
| `TasaExpirada`                 | `CancelarTransferencia`          |
| `SaldoInsuficienteDetectado`   | `CancelarTransferencia`          |

---

## 5. Read Models (vistas para consulta)

| Read Model              | Para qué sirve                                          |
|-------------------------|---------------------------------------------------------|
| `SaldoDeBilletera`      | Mostrar balance y disponible al usuario (Angular).      |
| `EstadoDeTransferencia` | Seguir el avance/estado de una transferencia.           |
| `HistorialContable`     | Auditoría: listar asientos y verificar que cuadran.     |
