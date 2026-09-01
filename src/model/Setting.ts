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
    llmList: Illm[];
}

export interface Idata {
    id: number;
    llmList: Illm[];
    isDelete: boolean;
}

export interface IdatabaseQuery {
    id: number;
    llm: Illm[];
}
