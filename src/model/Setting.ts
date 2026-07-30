export interface Illm {
    id: number;
    name: string;
    module: string;
    url: string;
    apiKey: string;
    selected: boolean;
}

export interface IapiUpdateBody {
    id: number;
    llm: Illm[];
}

export interface Idata {
    id: number;
    llm: Illm[];
}

export interface IdataDatabaseQuery {
    id: number;
    llm: Illm[];
}
