import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";
import * as securityScanner from "./security/Scanner.js";

export default class Security {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaParser;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaParser = z.object({
            mode: z.string().default("").describe("Can be: image or repository."),
            target: z.string().default("").describe("Can be: dockerHub tag or gitHub url.")
        });
    }

    scanner = (): modelMcp.Irpc<typeof this.inputSchemaParser> => {
        const name = "security_scanner";

        const config = {
            description: "Perform a security scan on the target image or repository.",
            inputSchema: this.inputSchemaParser
        };

        const content = async (argument: z.infer<typeof this.inputSchemaParser>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultScan = await securityScanner.execute(argument.mode, argument.target);

                result = JSON.stringify({ name: "security_scanner", resultList: [resultScan] });
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
