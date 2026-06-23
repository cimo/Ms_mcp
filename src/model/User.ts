export interface IapiDataUpdateBody {
    id: number;
    email: string;
    password: string;
}

export interface Idata {
    id: number;
    email: string;
    password: string;
    mcpSessionId?: string;
}

export interface IdataDatabaseQuery {
    id: number;
    email: string;
    password: string;
    mcp_session_id: string;
}

export interface IdataLoginSession {
    mcpSessionId: string;
    message: string;
}
