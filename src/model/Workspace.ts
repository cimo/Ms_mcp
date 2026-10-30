export interface IapiBody {
    folderJoin: string;
}

export interface IapiReadBody {
    fileName: string;
}

export interface IapiDeleteBody {
    pathList: string[];
}

export interface IapiRenameBody {
    pathItem: string;
    name: string;
}

export interface IapiFolderCreateBody {
    folderName: string;
    folderJoin: string;
}

export interface IapiFolderMoveBody {
    pathList: string[];
    folderJoin: string;
}

export interface IapiInfoQueryBody {
    name: string;
}

export interface IapiInfoUpdateBody {
    id: number;
    documentType: string;
    tag: string;
    note: string;
}

export interface IragDatabaseQuery {
    id: number;
}

export interface Idata {
    id: number;
    name: string;
    documentType: string;
    tag: string;
    note: string;
}

export interface IdatabaseQuery {
    id: number;
    name: string;
    document_type: string;
    tag: string;
    note: string;
}
