import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";

export default class Ocr {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            language: z.string().optional().describe("Language of the text in the image."),
            fileName: z.string().describe("Name of the image file."),
            searchText: z.string().optional().describe("Text to search for in the image."),
            mode: z.string().describe("Type of data to extract from the image.")
        });
    }

    execute = () => {
        const name = "ocr_execute";

        const config = {
            description: "Extract text from an image.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    result = await runtime.ocrExecute(
                        extra.sessionId,
                        argument.language || "-",
                        argument.fileName,
                        argument.searchText || "-",
                        argument.mode
                    );
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
