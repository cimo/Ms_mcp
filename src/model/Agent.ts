export interface IapiAgentCreateBody {
    name: string;
    description: string;
    skillName: string;
}

export interface IapiAgentUpdateBody {
    id: number;
    name: string;
    description: string;
    skillName: string;
}

export interface IapiAgentDeleteBody {
    id: number;
}

export interface Iagent {
    id?: number;
    name: string;
    description: string;
    skillName: string;
}

export interface IdatabaseQueryAgent {
    id: number;
    name: string;
    description: string;
    skill_name: string;
}
