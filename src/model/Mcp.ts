import { z } from "zod";

export interface IruntimeHandlerData {
    id: string;
    result?: string;
    error?: string;
}

export interface IruntimeWorkerMessageData {
    id: string;
    sessionId: string;
    tool: string;
    argumentList: unknown[];
}

export interface ItoolRpc<TSchema extends z.ZodTypeAny> {
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

export interface ItoolCall {
    name: string;
    argumentObject: Record<string, string>;
}

export interface ItoolTask {
    list: ItoolCall[];
}
