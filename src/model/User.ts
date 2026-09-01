export interface IapiUpdateBody {
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
    mcpSessionId: string | null;
    isDelete: boolean;
}

export interface IdatabaseQuery {
    id: number;
    email: string;
    name: string;
    surname: string;
    password: string;
    mcp_session_id: string | null;
}
