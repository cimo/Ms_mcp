export interface IrequestStore {
    mcpSessionId: string;
    fileName: string;
}

export interface IrequestSearch {
    mcpSessionId: string;
    prompt: string;
    entityList: string[];
    themeList: string[];
    rowList: number[];
}

export interface IrequestDelete {
    mcpSessionId: string;
    fileName: string;
}
