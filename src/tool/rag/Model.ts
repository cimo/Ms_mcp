export interface IinstanceContext {
    cookie?: string;
}

export interface IapiEmbeddingData {
    object: string;
    embedding: number[];
    index: number;
}

export type TsemanticChunkOption = {
    maxChars: number;
    overlapSentences?: number;
};
