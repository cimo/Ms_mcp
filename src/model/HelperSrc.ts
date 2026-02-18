export interface IresponseBody {
    response: {
        stdout: string;
        stderr: string | Error;
    };
}

export interface ImimeType {
    extension: string;
    content: string;
}
