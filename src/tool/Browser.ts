import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";

export default class Browser {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaChrome;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaChrome = z.object({
            url: z.string().default("").describe("URL to open in the browser.")
        });
    }

    chrome = (): modelMcp.Irpc<typeof this.inputSchemaChrome> => {
        const name = "chrome";

        const config = {
            description: "Open the browser chrome application.",
            inputSchema: this.inputSchemaChrome
        };

        const content = async (argument: z.infer<typeof this.inputSchemaChrome>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    const resultChrome = await runtime.chrome(extra.sessionId, argument.url);
                    result = JSON.stringify({ name: "chrome", resultList: [resultChrome] });
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
