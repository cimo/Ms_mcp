export interface IinstanceContext {
    cookie?: string;
}

export interface IapiEmbeddingData {
    object: string;
    embedding: number[];
    index: number;
}

export interface IapiCitation {
    fileName: string;
    citation: string;
    distance?: number;
}

export interface IsearchIndex {
    partIndex: number;
    textOffset: number;
}

export interface IhighlightRange {
    start: number;
    end: number;
}

export type TsemanticChunkOption = {
    maxChars: number;
    overlapSentences?: number;
};

export interface IapiRag {
    fileName: string;
    pageNumber?: number;
    citation?: string;
}

export interface IapiRagResult {
    type: string;
    resultList: IapiRag[];
}
