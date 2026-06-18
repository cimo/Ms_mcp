export interface IapiUserUpdateBody {
    id: number;
    email: string;
    password: string;
}

export interface Iuser {
    id: number;
    email: string;
    password: string;
    mcpSessionId?: string;
}

export interface IdatabaseQueryUser {
    id: number;
    email: string;
    password: string;
    mcp_session_id: string;
}

export interface IloginSession {
    mcpSessionId: string;
    message: string;
}
