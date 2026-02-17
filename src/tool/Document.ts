import { z } from "zod";

// Source
import * as documentParse from "./document/Parse.js";
import * as modelServer from "../model/Server.js";

export default class Document {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            fileName: z.string().describe("File name.")
        });
    }

    parse = () => {
        const name = "document_parse";

        const config = {
            description: "Parse document and extract data.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                result = JSON.stringify(await documentParse.execute(argument.fileName));
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
