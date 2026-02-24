import { Request } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ChildProcess } from "child_process";

// Source
import ControllerRuntime from "src/controller/Runtime.js";

export interface Icors {
    originList: string[];
    methodList: string[];
    preflightContinue: boolean;
    optionsSuccessStatus: number;
}

export interface Ilimiter {
    windowMs: number;
    limit: number;
}

export interface Irequest extends Request {
    clientIp?: string | undefined;
}

export interface Isession {
    rpc: StreamableHTTPServerTransport;
    display: number;
    runtimeWorker: ChildProcess | undefined;
    runtime: ControllerRuntime | undefined;
}
