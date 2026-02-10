export interface IresponseBody {
    response: {
        stdout: string;
        stderr: string | Error;
    };
}
