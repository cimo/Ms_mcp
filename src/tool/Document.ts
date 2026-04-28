import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";
import * as documentParser from "./document/Parser.js";

export default class Document {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaParser;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaParser = z.object({
            fileName: z.string().default("").describe("File name."),
            searchInput: z.string().default("").describe("Search input.")
        });
    }

    parser = (): modelMcp.Irpc<typeof this.inputSchemaParser> => {
        const name = "document_parser";

        const config = {
            description: "Parse docx, xlsx, pptx, pdf document and extract data.",
            inputSchema: this.inputSchemaParser
        };

        const content = async (argument: z.infer<typeof this.inputSchemaParser>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultParser = await documentParser.execute(extra.sessionId, argument.fileName, argument.searchInput);
                result = JSON.stringify({ name: "document_parser", resultList: [resultParser] });
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
