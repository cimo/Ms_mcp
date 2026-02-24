export interface IruntimeHandlerData {
    id: string;
    result?: string;
    error?: string;
}

export interface IruntimeWorkerMessageData {
    id: string;
    sessionId: string;
    tool: string;
    argumentList: unknown[];
}

export interface ItoolTask {
    stepList: [
        {
            action: string;
            argumentObject: Record<string, string>;
        }
    ];
}
