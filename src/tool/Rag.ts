import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as ragEmbedding from "./rag/Embedding.js";
import * as modelServer from "../model/Server.js";

export default class Rag {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({});
    }

    execute = () => {
        const name = "rag_embedding";

        const config = {
            description: "Embedding text data.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const uniqueId = helperSrc.generateUniqueId();

                await ragEmbedding.execute(extra.sessionId, uniqueId, result);
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: result
                    }
                ]
            };
        };

        return { name, config, content };
    };
}
