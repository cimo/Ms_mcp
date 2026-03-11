import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";
import * as ragEmbedding from "./rag/Embedding.js";

export default class Rag {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaStore;
    inputSchemaSearch;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaStore = z.object({
            fileContent: z.string().default("").describe("File content.")
        });

        this.inputSchemaSearch = z.object({
            input: z.string().default("").describe("Input prompt.")
        });

        ragEmbedding.createDatabase();
    }

    store = (): modelMcp.Irpc<typeof this.inputSchemaStore> => {
        const name = "rag_store";

        const config = {
            description: "Store file content in the vector database.",
            inputSchema: this.inputSchemaStore
        };

        const content = async (argument: z.infer<typeof this.inputSchemaStore>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const uniqueId = helperSrc.generateUniqueId();

                await ragEmbedding.store(extra.sessionId, uniqueId, argument.fileContent);
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

    search = (): modelMcp.Irpc<typeof this.inputSchemaSearch> => {
        const name = "rag_search";

        const config = {
            description: "Search text in the vector database.",
            inputSchema: this.inputSchemaSearch
        };

        const content = async (argument: z.infer<typeof this.inputSchemaSearch>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const uniqueId = helperSrc.generateUniqueId();

                result = await ragEmbedding.search(extra.sessionId, uniqueId, argument.input);
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

    delete = (): modelMcp.Irpc<z.ZodObject<{}, z.core.$strip>> => {
        const name = "rag_delete";

        const config = {
            description: "Delete the table from the vector database.",
            inputSchema: z.object({}).strict()
        };

        const content = async (_: z.infer<z.ZodObject<{}, z.core.$strip>>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                ragEmbedding.drop(extra.sessionId);
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
