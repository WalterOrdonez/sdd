export interface SagaStep {
    readonly name: string;
    execute(): Promise<void>;
    compensate(): Promise<void>;
}

export type SagaResult =
    | { status: "COMPLETADA" }
    | { status: "COMPENSADA"; cause: unknown }
    | { status: "FALLIDA"; cause: unknown; compensationError: unknown };

export class TransferSaga {
    async execute(steps: readonly SagaStep[]): Promise<SagaResult> {
        const completed: SagaStep[] = [];
        try {
            for (const step of steps) {
                completed.push(step);
                await step.execute();
            }
            return { status: "COMPLETADA" };
        } catch (cause) {
            let compensationError: unknown;
            let compensationFailed = false;
            for (const step of completed.reverse()) {
                try {
                    await step.compensate();
                } catch (error) {
                    if (!compensationFailed) compensationError = error;
                    compensationFailed = true;
                }
            }
            if (compensationFailed) {
                return { status: "FALLIDA", cause, compensationError };
            }
            return { status: "COMPENSADA", cause };
        }
    }
}
