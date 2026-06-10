import { z } from "zod";

export interface IruntimeHandlerData {
    id: string;
    result?: string;
    error?: string;
}

export interface IruntimeWorkerMessageData {
    id: string;
    mcpSessionId: string;
    tool: string;
    argumentList: unknown[];
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

export interface IapiDocumentReadBody {
    pageNumber: number;
    fileName: string;
}

export interface IapiDocumentDeleteBody {
    fileName: string;
}

export interface IapiRagEmbeddingCheckBody {
    fileName: string;
}

export interface IapiSkillReadBody {
    fileName: string;
}

export interface IapiSkillDeleteBody {
    fileName: string;
}

export interface IapiAgentCreateBody {
    name: string;
    description: string;
    skillName: string;
}

export interface IapiAgentUpdateBody {
    id: number;
    name: string;
    description: string;
    skillName: string;
}

export interface IapiAgentDeleteBody {
    id: number;
}

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
        name: string;
        arguments: Record<string, string>;
        protocolVersion: string;
        capabilities: Record<string, unknown>;
        clientInfo: {
            name: string;
            version: string;
        };
    };
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

export interface ItaskCall {
    list: {
        name: string;
        argumentObject: Record<string, unknown>;
    }[];
}
