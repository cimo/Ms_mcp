export interface IdataHandler {
    id: string;
    result?: string;
    error?: string;
}

export interface IdataWorkerMessage {
    id: string;
    mcpSessionId: string;
    tool: string;
    argumentList: unknown[];
}
