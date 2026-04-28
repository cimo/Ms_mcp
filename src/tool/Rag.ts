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
    inputSchemaDelete;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaStore = z.object({
            fileName: z.string().default("").describe("File name.")
        });

        this.inputSchemaSearch = z.object({
            prompt: z.string().default("").describe("Search prompt.")
        });

        this.inputSchemaDelete = z.object({
            fileName: z.string().default("").describe("File name.")
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

                const resultStore = await ragEmbedding.store(extra.sessionId, uniqueId, argument.fileName);
                result = JSON.stringify({ name: "rag_store", resultList: [resultStore] });
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
                const fileList = await helperSrc.uploadedFileList(extra.sessionId, ".*");

                if (fileList.length > 0) {
                    const uniqueId = helperSrc.generateUniqueId();

                    const resultSearch = await ragEmbedding.search(extra.sessionId, uniqueId, argument.prompt);
                    result = JSON.stringify({ name: "rag_search", resultList: resultSearch });
                } else {
                    result = "No uploaded file.";
                }
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

    delete = (): modelMcp.Irpc<typeof this.inputSchemaDelete> => {
        const name = "rag_delete";

        const config = {
            description: "Delete the table from the vector database.",
            inputSchema: this.inputSchemaDelete
        };

        const content = async (argument: z.infer<typeof this.inputSchemaDelete>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultDelete = await ragEmbedding.drop(extra.sessionId, argument.fileName);
                result = JSON.stringify({ name: "rag_delete", resultList: [resultDelete] });
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
