import { ExecFileException } from /* webpackIgnore: true */ "child_process";

export interface IfileDetail {
    fileName: string;
    baseName: string;
    mimeType: string;
    extension: string;
    category: string;
    size: string;
    dateModified: string;
}

export interface Iexecution {
    error: ExecFileException | null;
    stdout: string;
    stderr: string;
}

export interface IresponseBody {
    response: {
        stdout: string;
        stderr: string | Error;
    };
}
