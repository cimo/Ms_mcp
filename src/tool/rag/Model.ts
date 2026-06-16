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
    entityList: Inode[];
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

export interface Inode {
    name: string;
    type: string;
    description: string;
}

export interface Irelation {
    source: string;
    verb: string;
    target: string;
    description: string;
    keyword: string;
}

export interface IgraphRelation {
    source: string;
    verb: string;
    target: string;
    description: string;
    chunk: string;
}

export interface IdatabaseQueryChunk {
    chunk: string;
    file_id: number;
    distance: number;
}

export interface IdatabaseQueryEdge {
    source: string;
    verb: string;
    target: string;
    description: string;
    file_id: number;
    chunk_index: number;
}

export interface IdatabaseQueryEdgeBuild {
    id: number;
    verb: string;
    description: string;
    keyword: string;
}

export interface IdatabaseQueryNodeVec {
    name: string;
    name_norm: string;
    description: string;
    distance: number;
}

export interface IdatabaseQueryEdgeVec {
    edge_id: number;
    distance: number;
}

export interface IdatabaseQueryEdgeFull {
    source: string;
    verb: string;
    target: string;
    description: string;
    keyword: string;
    source_norm: string;
    target_norm: string;
    file_id: number;
    chunk_index: number;
}

export interface IdatabaseQueryNode {
    name: string;
    name_norm: string;
    description: string;
}
