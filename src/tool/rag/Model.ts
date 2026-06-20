export interface IinstanceContext {
    cookie?: string;
}

export interface IrequestStore {
    mcpSessionId: string;
    uniqueId: string;
    fileName: string;
}

export interface IrequestSearch {
    mcpSessionId: string;
    uniqueId: string;
    prompt: string;
    entityList: string[];
    themeList: string[];
}

export interface IrequestDelete {
    mcpSessionId: string;
    fileName: string;
}
