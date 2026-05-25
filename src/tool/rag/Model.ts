export interface IinstanceContext {
    cookie?: string;
}

export interface IapiEmbedding {
    object: string;
    embedding: number[];
    index: number;
}

export interface IapiExtract {
    relationList: Irelation[];
}

export interface Icitation {
    fileName: string;
    chunk: string;
    distance: number;
}

export interface Irelation {
    source: string;
    verb: string;
    target: string;
}

export interface IsearchOutput {
    citationList: Icitation[];
    relationList: Irelation[];
}
