import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import * as documentParser from "./document/Parser.js";

export default class Document {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaParser;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaParser = z.object({
            fileName: z.string().default("").describe("Is the word ending with the document file extension."),
            searchInput: z.string().default("").describe("Is the word/phrase that the user is asking to look/find/search.")
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchemaParser> => {
        const name = "document_parser";

        const config = {
            description: ["Parse document and extract data."].join("\n"),
            example: ["- In the file 'Document.docx' search for 'Test'."].join("\n"),
            inputInstruction: [
                "You MUST need to extract, from the user prompt, ONLY the following schema:",
                `Parameter 1 fileName: ${this.inputSchemaParser.shape.fileName.description}`,
                `Parameter 2 searchInput: ${this.inputSchemaParser.shape.searchInput.description}`
            ].join("\n"),
            inputSchema: this.inputSchemaParser
        };

        const content = async (argument: z.infer<typeof this.inputSchemaParser>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultParser = await documentParser.execute(extra.sessionId, argument.fileName, argument.searchInput);
                result = JSON.stringify({ name, resultList: [JSON.parse(resultParser)] });
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
