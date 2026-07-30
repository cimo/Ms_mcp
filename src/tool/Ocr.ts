import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
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
            fileName: z
                .union([z.string(), z.number(), z.array(z.string()), z.null()])
                .default("")
                .describe("Is the word ending with the image file extension."),
            searchText: z
                .union([z.string(), z.number(), z.array(z.string()), z.null()])
                .default("")
                .describe("Is the word/phrase that the user is asking to search.")
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchema> => {
        const name = "ocr";

        const config = {
            description: ["Extract data from an image."].join("\n"),
            example: ["- In the file 'Image.jpg' search 'Test'."].join("\n"),
            inputInstruction: [
                "You MUST build the json schema using ONLY the following parameters:",
                `Parameter 1 - fileName: ${this.inputSchema.shape.fileName.description}`,
                `Parameter 2 - searchText: ${this.inputSchema.shape.searchText.description}`
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
                        helperSrc.zodText(argument.fileName),
                        helperSrc.zodText(argument.searchText)
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
