import type { Currency } from "./money.js";

export type TransferStatus =
    | "PENDIENTE"
    | "COMPLETADA"
    | "RECHAZADA"
    | "COMPENSADA"
    | "FALLIDA";

export interface TransferSnapshot {
    id: string;
    fromWalletId: string;
    toWalletId: string;
    debitedMinor: number;
    creditedMinor: number;
    fromCurrency: Currency;
    toCurrency: Currency;
    status: TransferStatus;
    createdAt: number;
    failureReason?: string;
}

export class Transfer {
    constructor(private readonly state: TransferSnapshot) {}

    get status(): TransferStatus {
        return this.state.status;
    }

    transition(status: TransferStatus): Transfer {
        return new Transfer({ ...this.state, status });
    }

    snapshot(): TransferSnapshot {
        return { ...this.state };
    }
}
