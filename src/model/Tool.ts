import { z } from "zod";

export interface IapiRpcBody {
    jsonrpc: string;
    id?: number;
    method: string;
    params?: Record<string, unknown>;
}

export interface IapiToolCallBody extends Record<string, unknown> {
    jsonrpc: string;
    id: number;
    method: string;
    params: {
        protocolVersion: string;
        capabilities: Record<string, unknown>;
        clientInfo: {
            name: string;
            version: string;
        };
        name: string;
        arguments: Record<string, string>;
    };
}

export interface IapiTaskCallBody {
    list: {
        name: string;
        argumentObject: Record<string, unknown>;
    }[];
}

export interface Irpc<TSchema extends z.ZodTypeAny> {
    name: string;
    config: {
        description: string;
        example: string;
        inputInstruction: string;
        inputSchema: TSchema;
    };
    content: (
        argument: z.infer<TSchema>,
        extra: { sessionId?: string }
    ) => Promise<{
        content: Array<{ type: "text"; text: string }>;
    }>;
}

export interface Itool {
    name: string;
    argumentObject: Record<string, unknown>;
    icon: string;
    description: string;
    example: string;
    inputInstruction: string;
}

export interface Itask {
    name: string;
    argumentObject: Record<string, unknown>;
    icon: string;
    description: string;
    example: string;
    inputInstruction: string;
}
