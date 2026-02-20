import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";

export default class Browser {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({ url: z.string().describe("URL to open in the browser.") });
    }

    chromeExecute = () => {
        const name = "chrome_execute";

        const config = {
            description: "Open the browser chrome application.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    result = await runtime.chromeExecute(extra.sessionId, argument.url);
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
