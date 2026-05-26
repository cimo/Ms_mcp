export interface IresponseBody {
    response: {
        stdout: string;
        stderr: string | Error;
    };
}

export interface IfileDetail {
    fileName: string;
    dateModified: string;
    size: string;
}

export interface ImimeType {
    extension: string;
    content: string;
}
