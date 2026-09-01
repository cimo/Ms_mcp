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
