import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";
import * as mathExpression from "./math/Expression.js";

export default class Math {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            input: z.string().default("").describe("A math expression.")
        });
    }

    expression = (): modelMcp.Irpc<typeof this.inputSchema> => {
        const name = "math_expression";

        const config = {
            description: "Evaluate expression.",
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                result = mathExpression.execute(argument.input).toString();
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
