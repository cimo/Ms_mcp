import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import * as securityScanner from "./security/Scanner.js";

export default class Security {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaParser;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaParser = z.object({
            mode: z.string().default("").describe("Is the word that indicates what type of analyze need be execute."),
            target: z.string().default("").describe("Is the docker tag or url repository that the user is asking to scan.")
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchemaParser> => {
        const name = "security_scanner";

        const config = {
            description: ["Perform a security scan on the docker tag image or repository."].join("\n"),
            example: [
                "- Scan with the mode 'image' for the target 'cimo001/ms_cronjob:1.0.0'",
                "- Scan with the mode 'repository' for the target 'https://github.com/cimo/Ms_cronjob'"
            ].join("\n"),
            inputInstruction: [
                "You MUST need to extract, from the user text, ONLY the following schema:",
                `Parameter 1 mode: ${this.inputSchemaParser.shape.mode.description}`,
                `Parameter 2 target: ${this.inputSchemaParser.shape.target.description}`
            ].join("\n"),
            inputSchema: this.inputSchemaParser
        };

        const content = async (argument: z.infer<typeof this.inputSchemaParser>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultExecute = await securityScanner.execute(argument.mode, argument.target);
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
