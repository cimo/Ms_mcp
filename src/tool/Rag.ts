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

        this.inputSchema = z.object({
            text: z.string().describe("Input text.")
        });

        ragEmbedding.createDatabase();
    }

    store = () => {
        const name = "rag_store";

        const config = {
            description: "Store file content in the vector database converted with the embedding model.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const uniqueId = helperSrc.generateUniqueId();

                await ragEmbedding.store(extra.sessionId, uniqueId, argument.text);
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

    search = () => {
        const name = "rag_search";

        const config = {
            description: "Search text in the vector database converted with the embedding model.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const uniqueId = helperSrc.generateUniqueId();

                result = await ragEmbedding.search(extra.sessionId, uniqueId, argument.text);
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
