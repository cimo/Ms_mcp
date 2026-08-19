import { ExecFileException } from /* webpackIgnore: true */ "child_process";

export interface IlocaleConfiguration {
    [key: string]: {
        locale: string;
        currency: string;
        dateFormat: string;
    };
}

export interface IfileDetail {
    name: string;
    baseName: string;
    size: string;
    dateModified: string;
    extension: string;
    category: string;
    mimeType: string;
}

export interface IfileDetailSignature {
    extension: string;
    category: string;
    mimeType: string;
    magicByteList?: {
        offset: number;
        bytes: number[];
    }[];
}

export interface Iexecution {
    error: ExecFileException | null;
    stdout: string;
    stderr: string;
}

export interface IapiResponse {
    response: {
        stdout: string;
        stderr: string | Error;
    };
}
