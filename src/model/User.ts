export interface IapiDataUpdateBody {
    id: number;
    name: string;
    surname: string;
    password: string;
}

export interface Idata {
    id: number;
    email: string;
    name: string;
    surname: string;
    password: string;
    mcpSessionId?: string | null;
}

export interface IdataDatabaseQuery {
    id: number;
    email: string;
    name: string;
    surname: string;
    password: string;
    mcp_session_id: string | null;
}

export interface IdataLoginSession {
    mcpSessionId: string;
    message: string;
}
