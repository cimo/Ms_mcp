import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";

export default class Ocr {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaExecute;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaExecute = z.object({
            language: z.string().default("").describe("Is the locale format that indicates the language used in the file."),
            fileName: z.string().default("").describe("Is the word ending with the image file extension."),
            searchText: z.string().default("").describe("Is the word/phrase that the user is asking to look/find/search."),
            mode: z.string().default("data").describe("Is the word that indicates what to extract from the file.")
        });
    }

    execute = (): modelMcp.Irpc<typeof this.inputSchemaExecute> => {
        const name = "ocr_execute";

        const config = {
            description: ["Extract data from an image."].join("\n"),
            example: ["- In the file 'Image.png' search for 'Text' with the language 'en' and mode 'data'."].join("\n"),
            inputInstruction: [
                "You MUST need to extract, from the user prompt, ONLY the following schema:",
                `Parameter 1 language: ${this.inputSchemaExecute.shape.language.description}`,
                `Parameter 2 fileName: ${this.inputSchemaExecute.shape.fileName.description}`,
                `Parameter 3 searchText: ${this.inputSchemaExecute.shape.searchText.description}`,
                `Parameter 4 mode: ${this.inputSchemaExecute.shape.mode.description}`
            ].join("\n"),
            inputSchema: this.inputSchemaExecute
        };

        const content = async (argument: z.infer<typeof this.inputSchemaExecute>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    const resultOcr = await runtime.ocrExecute(
                        extra.sessionId,
                        argument.language,
                        argument.fileName,
                        argument.searchText,
                        argument.mode
                    );
                    result = JSON.stringify({ name: "ocr_execute", resultList: [resultOcr] });
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
