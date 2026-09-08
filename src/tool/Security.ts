import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import * as securityScanner from "./security/Scanner.js";

export default class Security {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            mode: z
                .union([z.string(), z.number(), z.array(z.string()), z.null()])
                .default("")
                .describe("Is the word that indicates what type of analyze need be execute."),
            target: z
                .union([z.string(), z.number(), z.array(z.string()), z.null()])
                .default("")
                .describe("Is the docker tag or url repository that the user is asking to check.")
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchema> => {
        const name = "security_scanner";

        const config = {
            description: ["Perform a security scan on the docker tag image or repository."].join("\n"),
            example: [
                "- Scan with the mode 'image' the target 'cimo001/ms_cronjob:1.0.0'",
                "- Scan with the mode 'repository' the target 'https://github.com/cimo/Ms_cronjob'"
            ].join("\n"),
            inputInstruction: [
                "You can receive ONLY 1 instruction (is impossible have more instructions on the same time) from the user prompt:",
                "Number 1 is used for performing a security scan on a docker image or git repository.",
                `1. From the user prompt, you MUST need to extract and build the json schema using ONLY the following parameters -> Parameter 1 - mode: ${this.inputSchema.shape.mode.description}, Parameter 2 - target: ${this.inputSchema.shape.target.description}`
            ].join("\n"),
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultExecute = await securityScanner.execute(helperSrc.zodText(argument.mode), helperSrc.zodText(argument.target));
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
