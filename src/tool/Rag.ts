import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import * as ragProcess from "./rag/Process.js";

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
            fileName: z
                .union([z.string(), z.number(), z.array(z.string()), z.null()])
                .default("")
                .describe("File name.")
        });

        this.inputSchemaSearch = z.object({
            prompt: z
                .union([z.string(), z.number(), z.array(z.string()), z.null()])
                .default("")
                .describe(
                    "The exact content to search, extracted from the user prompt: only the subject words, WITHOUT question or intent words. Words that refer to the documents or the collection being searched, rather than to the topic asked about, are intent words and MUST be excluded from the subject."
                ),
            entity: z
                .union([z.array(z.string()), z.string(), z.number(), z.null()])
                .default([])
                .describe(
                    "Array of the key entities and topics (people, organizations, places, things, concepts) mentioned in the user prompt, WITHOUT question or intent words and WITHOUT words that refer to the documents or the collection being searched rather than to the topic asked about."
                ),
            theme: z
                .union([z.array(z.string()), z.string(), z.number(), z.null()])
                .default([])
                .describe(
                    "Array of the high level concepts or relations the question is about (what links the entities). Use specific concept phrases of two or more words, avoid single generic words like 'life' or 'activities'."
                ),
            row: z
                .union([z.array(z.number()), z.array(z.string()), z.number(), z.string(), z.null()])
                .default([])
                .describe(
                    "Array of the spreadsheet row numbers referenced in the user prompt, in any language, including the row implied by a cell reference. Empty if the prompt references no row."
                )
        });

        this.inputSchemaDelete = z.object({
            fileName: z
                .union([z.string(), z.number(), z.array(z.string()), z.null()])
                .default("")
                .describe("File name.")
        });
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
                const resultStore = await ragProcess.databaseStore(extra.sessionId, helperSrc.zodText(argument.fileName));
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
            example: ["- Which document talk about: 'XXX'."].join("\n"),
            inputInstruction: [
                "You MUST build the json schema using ONLY the following parameters:",
                `Parameter 1 - prompt: ${this.inputSchemaSearch.shape.prompt.description}`,
                `Parameter 2 - entity: ${this.inputSchemaSearch.shape.entity.description}`,
                `Parameter 3 - theme: ${this.inputSchemaSearch.shape.theme.description}`,
                `Parameter 4 - row: ${this.inputSchemaSearch.shape.row.description}`
            ].join("\n"),
            inputSchema: this.inputSchemaSearch
        };

        const content = async (argument: z.infer<typeof this.inputSchemaSearch>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const documentList = await helperSrc.uploadedDocumentRead(extra.sessionId, ".*");

                if (documentList.length > 0) {
                    const resultSearch = await ragProcess.databaseSearch(
                        extra.sessionId,
                        helperSrc.zodText(argument.prompt),
                        helperSrc.zodTextList(argument.entity),
                        helperSrc.zodTextList(argument.theme),
                        helperSrc.zodNumberList(argument.row)
                    );
                    result = JSON.stringify({ name, result: JSON.parse(resultSearch) });
                } else {
                    result = JSON.stringify({ name, result: { citationList: [], nodeList: [], graphList: [] } });
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
                const resultDelete = await ragProcess.databaseDelete(extra.sessionId, helperSrc.zodText(argument.fileName));
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
