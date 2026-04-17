import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";
import * as modelRag from "./rag/Model.js";
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
            fileName: z.string().default("").describe("File name."),
            fileContent: z.string().default("").describe("File content.")
        });

        this.inputSchemaSearch = z.object({
            mode: z.string().default("").describe("Search mode: <database|document>."),
            fileName: z.string().default("").describe("File name: <filename|All>."),
            input: z.string().default("").describe("Search input: <input>.")
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

                await ragEmbedding.store(extra.sessionId, uniqueId, argument.fileName, argument.fileContent);
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
            description:
                "Search text in the vector database or document.\n" +
                "Use the prompt: \n" +
                "Search mode: <database|document>. File name: <filename|All>. Search input: <input>.",
            inputSchema: this.inputSchemaSearch
        };

        const content = async (argument: z.infer<typeof this.inputSchemaSearch>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const fileName = argument.fileName.trim().replace(/\.+$/, "");
                const mode = argument.mode.trim().replace(/\.+$/, "");
                const input = argument.input.trim().replace(/\.+$/, "");

                const searchFileName = fileName.toLowerCase() === "all" ? ".*" : fileName;

                const fileList = await helperSrc.uploadedFileList(extra.sessionId, searchFileName);

                if (fileList.length > 0) {
                    if (mode.toLowerCase() === "database") {
                        const uniqueId = helperSrc.generateUniqueId();

                        result = await ragEmbedding.searchDatabase(extra.sessionId, uniqueId, fileName, input);
                    } else if (mode.toLowerCase() === "document") {
                        const resultList: modelRag.IapiRag[] = [];
                        const baseFileNameList: string[] = [];

                        for (const fileName of fileList) {
                            const baseFileName = helperSrc.baseFileName(fileName);

                            if (!baseFileNameList.includes(baseFileName)) {
                                const searchResult = await ragEmbedding.searchDocument(extra.sessionId, fileName, input);

                                resultList.push({
                                    fileName,
                                    pageNumber: searchResult.pageNumber
                                });

                                baseFileNameList.push(baseFileName);
                            }
                        }

                        if (resultList.length === 0) {
                            result = "Not found in document(s).";
                        } else {
                            result = JSON.stringify({
                                type: "html",
                                resultList
                            } as modelRag.IapiRagResult);
                        }
                    } else {
                        result = `Error: Invalid search mode: ${mode}. Please use "database" or "document".`;
                    }
                } else {
                    result = fileName.toLowerCase() === "all" ? "Error: No uploaded file." : `Error: File does not exist: ${fileName}.`;
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
                ragEmbedding.drop(extra.sessionId, argument.fileName);
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
