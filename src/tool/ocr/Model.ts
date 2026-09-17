interface Ilayout {
    label: string;
    score: number;
    centerPoint: {
        x: number;
        y: number;
    };
}

interface Iitem {
    id: number;
    text: string;
    centerPoint: {
        x: number;
        y: number;
    };
}

export interface IinstanceContext {
    cookie?: string;
}

export interface IapiExtractResponse {
    uniqueId: string;
    layoutList: Ilayout[];
    itemList: Iitem[];
}
