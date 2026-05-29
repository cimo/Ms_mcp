export interface IfileDetail {
    fileName: string;
    baseName: string;
    mimeType: string;
    extension: string;
    category: string;
    size: string;
    dateModified: string;
}

export interface IresponseBody {
    response: {
        stdout: string;
        stderr: string | Error;
    };
}
