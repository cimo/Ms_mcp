import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import * as mathExpression from "./math/Expression.js";

export default class Math {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaExpression;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaExpression = z.object({
            prompt: z.string().default("").describe("Is the full math expression that needs to be evaluated.")
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchemaExpression> => {
        const name = "math_expression";

        const config = {
            description: ["Evaluate a math expression."].join("\n"),
            example: ["- Calculate this expression: 1 + 2 * 3"].join("\n"),
            inputInstruction: [
                "You MUST build the json schema using ONLY the following parameters:",
                `Parameter 1 - prompt: ${this.inputSchemaExpression.shape.prompt.description}`
            ].join("\n"),
            inputSchema: this.inputSchemaExpression
        };

        const content = async (argument: z.infer<typeof this.inputSchemaExpression>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultExecute = await mathExpression.execute(argument.prompt);
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
