import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
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
            fileNameList: z
                .union([z.array(z.string()), z.string(), z.number(), z.null()])
                .default([])
                .describe(
                    "Array of the words ending with the document or image file extension, one for each file named in the user prompt, in the order they appear."
                )
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchema> => {
        const name = "document_parser";

        const config = {
            description: ["Read the content of one or more files in markdown format."].join("\n"),
            example: ["- In the file 'Xxx.docx' show how much is the total.", "- Compare 'Xxx.docx' with 'Report.pdf'."].join("\n"),
            inputInstruction: [
                "You can receive ONLY 1 instruction from the user prompt:",
                "Number 1 is used for reading the content of one or more files.",
                `1. From the user prompt, you MUST need to extract and build the json schema using ONLY the following parameters -> Parameter 1 - fileNameList: ${this.inputSchema.shape.fileNameList.description}`
            ].join("\n"),
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultExecute = await documentParser.execute(extra.sessionId, helperSrc.zodTextList(argument.fileNameList));
                result = JSON.stringify({ name, result: resultExecute });
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
