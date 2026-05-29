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
        inputSchema: TSchema;
    };
    content: (
        argument: z.infer<TSchema>,
        extra: { sessionId?: string }
    ) => Promise<{
        content: Array<{ type: "text"; text: string }>;
    }>;
}

export interface ItoolResponse {
    name: string;
    resultList: [];
}

export interface Itool {
    name: string;
    argumentObject: Record<string, unknown>;
    icon: string;
    description: string;
}

export interface ItoolCall {
    name: string;
    argumentObject: Record<string, unknown>;
}

export interface Itask {
    name: string;
    argumentObject: Record<string, unknown>;
    icon: string;
    description: string;
}

export interface ItaskCall {
    list: ItoolCall[];
}
