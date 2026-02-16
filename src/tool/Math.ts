import { z } from "zod";

// Source
import * as mathExpression from "./math/Expression.js";
import * as modelServer from "../model/Server.js";

export default class Math {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            input: z.string().describe("A math expression, example: '3 + 4 * (2 - 1) ^ 3 / 2'")
        });
    }

    expression = () => {
        const name = "tool_math_expression";

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
