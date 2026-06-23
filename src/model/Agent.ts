export interface IapiDataCreateBody {
    name: string;
    description: string;
    skillName: string;
}

export interface IapiDataUpdateBody {
    id: number;
    name: string;
    description: string;
    skillName: string;
}

export interface IapiDataDeleteBody {
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
