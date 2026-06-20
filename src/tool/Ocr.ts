import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";

export default class Ocr {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            language: z.string().default("").describe("Is the locale format that indicates the language used in the file."),
            fileName: z.string().default("").describe("Is the word ending with the image file extension."),
            searchText: z.string().default("").describe("Is the word/phrase that the user is asking to look/find/search."),
            mode: z.string().default("data").describe("Is the word that indicates what to extract from the file.")
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchema> => {
        const name = "ocr";

        const config = {
            description: ["Extract data from an image."].join("\n"),
            example: ["- In the file 'Image.png' search for 'Text' with the language 'en' and mode 'data'."].join("\n"),
            inputInstruction: [
                "You MUST build the json schema using ONLY the following parameters:",
                `Parameter 1 - language: ${this.inputSchema.shape.language.description}`,
                `Parameter 2 - fileName: ${this.inputSchema.shape.fileName.description}`,
                `Parameter 3 - searchText: ${this.inputSchema.shape.searchText.description}`,
                `Parameter 4 - mode: ${this.inputSchema.shape.mode.description}`
            ].join("\n"),
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    const resultRuntime = await runtime.ocrExecute(
                        extra.sessionId,
                        argument.language,
                        argument.fileName,
                        argument.searchText,
                        argument.mode
                    );
                    result = JSON.stringify({ name, result: resultRuntime });
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
