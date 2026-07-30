export interface IapiCreateBody {
    name: string;
    description: string;
    skillName: string;
}

export interface IapiUpdateBody {
    id: number;
    name: string;
    description: string;
    skillName: string;
}

export interface IapiDeleteBody {
    id: number;
}

export interface Idata {
    id?: number;
    name: string;
    description: string;
    skillName: string;
}

export interface IdataDatabaseQuery {
    id: number;
    name: string;
    description: string;
    skill_name: string;
}
