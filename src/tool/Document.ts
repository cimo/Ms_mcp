import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";
import * as documentParse from "./document/Parser.js";

export default class Document {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaParse;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaParse = z.object({
            fileName: z.string().default("").describe("File name.")
        });
    }

    parse = (): modelMcp.Irpc<typeof this.inputSchemaParse> => {
        const name = "document_parse";

        const config = {
            description: "Parse docx, xlsx, pptx, pdf document and extract data.",
            inputSchema: this.inputSchemaParse
        };

        const content = async (argument: z.infer<typeof this.inputSchemaParse>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                result = await documentParse.execute(extra.sessionId, argument.fileName);
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
