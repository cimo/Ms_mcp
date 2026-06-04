import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
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
            prompt: z.string().default("").describe("Is the word/phrase that the user is asking to look/find/search.")
        });

        this.inputSchemaDelete = z.object({
            fileName: z.string().default("").describe("File name.")
        });

        ragEmbedding.databaseCreate();
    }

    store = (): modelTool.Irpc<typeof this.inputSchemaStore> => {
        const name = "rag_store";

        const config = {
            description: ["Store file content in the vector database."].join("\n"),
            example: [""].join("\n"),
            inputInstruction: [].join("\n"),
            inputSchema: this.inputSchemaStore
        };

        const content = async (argument: z.infer<typeof this.inputSchemaStore>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const uniqueId = helperSrc.generateUniqueId();

                const resultStore = await ragEmbedding.databaseStore(extra.sessionId, uniqueId, argument.fileName);
                result = JSON.stringify({ name, result: resultStore });
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

    search = (): modelTool.Irpc<typeof this.inputSchemaSearch> => {
        const name = "rag_search";

        const config = {
            description: ["Search text in the vector database."].join("\n"),
            example: ["- Explain to me XXX."].join("\n"),
            inputInstruction: [
                "You MUST need to extract, from the user prompt, ONLY the following schema:",
                `Parameter 1 prompt: ${this.inputSchemaSearch.shape.prompt.description}`
            ].join("\n"),
            inputSchema: this.inputSchemaSearch
        };

        const content = async (argument: z.infer<typeof this.inputSchemaSearch>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const documentList = await helperSrc.uploadedDocumentList(extra.sessionId, ".*");

                if (documentList.length > 0) {
                    const uniqueId = helperSrc.generateUniqueId();

                    const resultSearch = await ragEmbedding.databaseSearch(extra.sessionId, uniqueId, argument.prompt);
                    result = JSON.stringify({ name, result: JSON.parse(resultSearch) });
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

    delete = (): modelTool.Irpc<typeof this.inputSchemaDelete> => {
        const name = "rag_delete";

        const config = {
            description: ["Delete the table from the vector database."].join("\n"),
            example: [""].join("\n"),
            inputInstruction: [].join("\n"),
            inputSchema: this.inputSchemaDelete
        };

        const content = async (argument: z.infer<typeof this.inputSchemaDelete>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultDelete = await ragEmbedding.databaseDelete(extra.sessionId, argument.fileName);
                result = JSON.stringify({ name, result: resultDelete });
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
