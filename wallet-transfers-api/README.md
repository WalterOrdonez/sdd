# Wallet Transfers API

Servicio REST que contiene las reglas y persistencia de billeteras. `billeteras-mcp` consume
esta API por HTTP para consultar saldos y cotizar.

## Requisitos

- Node.js 20.19+, 22.13+ o 24.11+
- MySQL 8+ con InnoDB

## Desarrollo

```powershell
npm install
Copy-Item .env.example .env
# Configure MYSQL_* y FX_RATES_JSON en .env
npm test
npm run build
npm run migration:run
npm run dev
```

La aplicación exporta `app` para pruebas HTTP sin abrir un puerto. `npm run dev` inicializa
MySQL y aplica las migraciones antes de escuchar. Configure las tasas de forma explícita en
`FX_RATES_JSON`; no se inventan cotizaciones ni se recotiza una transferencia expirada.

## API

- `GET /health`
- `GET /wallets/:walletId`
- `POST /transfers` con header `Idempotency-Key`
- `POST /fx-quotes` con `from`, `to` y `amountMinor`; la respuesta incluye `estimatedAmountMinor`
- `POST /fx-transfers` con header `Idempotency-Key`

Los request/response siguen `.specs/contracts/openapi.yml`. Saldos se representan en unidades
menores enteras; los tipos y los límites del dominio rechazan valores no enteros o fuera del
rango seguro. La ruta FX requiere un `quoteId` previamente emitido y valida su expiración con
el reloj del servidor al ejecutar.

## Persistencia y concurrencia

Las migraciones crean las tablas `wallets`, `transfers`, `fx_quotes`, `ledger_entries` e
`idempotency_keys`; esta última tiene índice `UNIQUE` sobre la clave. En producción, el
repositorio TypeORM usa una transacción `QueryRunner`, `SELECT ... FOR UPDATE` y rollback
ante fallos. Las pruebas usan el adaptador en memoria con exclusión mutua y commit mediante
copia, para ejercitar concurrencia y rollback sin requerir un MySQL local.

No se insertan billeteras ni saldos de muestra automáticamente. Cree las billeteras iniciales
mediante el proceso de onboarding/administración de su entorno antes de transferir.

## Pruebas

```powershell
npm test
npm run build
```

## MCP local

Ejecute `npm run dev` en la carpeta de la API. En otra terminal, ejecute lo siguiente desde
`billeteras-mcp`:

```powershell
npm install
npm run dev
```

El MCP usa `http://localhost:3000` por defecto; se puede sobrescribir con
`WALLET_TRANSFERS_API_URL`. La API debe tener configuradas las tasas FX y las billeteras
iniciales en MySQL.
