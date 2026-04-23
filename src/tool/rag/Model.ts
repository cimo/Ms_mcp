export interface IinstanceContext {
    cookie?: string;
}

export interface IapiEmbeddingData {
    object: string;
    embedding: number[];
    index: number;
}

export type TsemanticChunkOption = {
    maxLenght: number;
    overlapSentenceCount: number;
};

export interface IapiCitation {
    fileName: string;
    citation: string;
    distance: number;
}

export interface IapiRag {
    fileName: string;
    pageNumber?: number;
    citation?: string;
}

export interface IapiRagResult {
    type: string;
    resultList: IapiRag[];
}
