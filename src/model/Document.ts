export interface IapiListBody {
    folderJoin: string;
}

export interface IapiReadBody {
    fileName: string;
}

export interface IapiDeleteBody {
    pathItem: string;
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
