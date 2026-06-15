export interface IinstanceContext {
    cookie?: string;
}

export interface IapiEmbedding {
    data: {
        object: string;
        embedding: number[];
        index: number;
    }[];
}

export interface IapiExtract {
    relationList: Irelation[];
}

export interface Ifile {
    id: number;
    name: string;
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

export interface IdatabaseQueryChunk {
    chunk: string;
    file_id: number;
    distance: number;
}

export interface IdatabaseQueryNode {
    name: string;
}
