import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";

export default class Ocr {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            language: z.string().default("").describe("Language of the text in the image."),
            fileName: z.string().default("").describe("Name of the image file."),
            searchText: z.string().default("").describe("Text to search in the image."),
            mode: z.string().default("data").describe("Type of data to extract from the image.")
        });
    }

    execute = (): modelMcp.Irpc<typeof this.inputSchema> => {
        const name = "ocr_execute";

        const config = {
            description: "Extract data from an image.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    result = await runtime.ocrExecute(extra.sessionId, argument.language, argument.fileName, argument.searchText, argument.mode);
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
}
