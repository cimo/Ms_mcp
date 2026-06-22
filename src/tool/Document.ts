import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import * as documentParser from "./document/Parser.js";

export default class Document {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            fileName: z.string().default("").describe("Is the word ending with the document file extension."),
            searchInput: z.string().default("").describe("Is the word/phrase that the user is asking to look/find/search.")
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchema> => {
        const name = "document_parser";

        const config = {
            description: ["Parse document and extract data."].join("\n"),
            example: ["- In the file 'Document.docx' search 'Test'."].join("\n"),
            inputInstruction: [
                "You MUST build the json schema using ONLY the following parameters:",
                `Parameter 1 - fileName: ${this.inputSchema.shape.fileName.description}`,
                `Parameter 2 - searchInput: ${this.inputSchema.shape.searchInput.description}`
            ].join("\n"),
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultExecute = await documentParser.execute(extra.sessionId, argument.fileName, argument.searchInput);
                result = JSON.stringify({ name, result: JSON.parse(resultExecute) });
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
