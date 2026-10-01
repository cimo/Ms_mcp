export interface Iservice {
    id: number;
    name: string;
    module: string;
    url: string;
    apiKey: string;
    selected: boolean;
}

export interface Iusage {
    id: number;
    name: string;
    selected: boolean;
}

export interface Illm {
    serviceList: Iservice[];
    usageList: Iusage[];
}

export interface IapiUpdateBody {
    id: number;
    llm: Illm;
}

export interface Idata {
    id: number;
    llm: Illm;
}

export interface IdatabaseQuery {
    id: number;
    llm: Illm;
}
