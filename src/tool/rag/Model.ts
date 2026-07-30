export interface IapiStoreBody extends Record<string, unknown> {
    mcpSessionId: string;
    fileName: string;
}

export interface IapiSearchBody extends Record<string, unknown> {
    mcpSessionId: string;
    prompt: string;
    entityList: string[];
    rowList: number[];
}

export interface IapiDeleteBody extends Record<string, unknown> {
    mcpSessionId: string;
    fileName: string;
}
