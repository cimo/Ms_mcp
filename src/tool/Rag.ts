import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as ragEmbedding from "./rag/Embedding.js";
import * as modelServer from "../model/Server.js";

export default class Rag {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchemaStore;
    private inputSchemaSearch;
    private inputSchemaDelete;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaStore = z.object({
            fileContent: z.string().describe("File content.")
        });

        this.inputSchemaSearch = z.object({
            input: z.string().describe("Input prompt.")
        });

        this.inputSchemaDelete = z.object({});

        ragEmbedding.createDatabase();
    }

    store = () => {
        const name = "rag_store";

        const config = {
            description: "Store file content in the vector database converted with the embedding model.",
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

    search = () => {
        const name = "rag_search";

        const config = {
            description: "Search text in the vector database converted with the embedding model.",
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

    remove = () => {
        const name = "rag_delete_table";

        const config = {
            description: "Remove the table with the file content in the vector database.",
            inputSchema: this.inputSchemaDelete
        };

        const content = async (argument: z.infer<typeof this.inputSchemaDelete>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                ragEmbedding.remove(extra.sessionId);
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
