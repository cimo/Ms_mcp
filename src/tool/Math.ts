import { z } from "zod";
import type { Context } from "fastmcp";

// Source
import * as mathExpression from "./math/Expression.js";

export default class Math {
    // Variable

    // Method
    constructor() {}

    expression = () => {
        const parameterObject = z.object({
            input: z.string().describe("A math expression, example: '3 + 4 * (2 - 1) ^ 3 / 2'")
        });

        return {
            name: "tool_math_expression",
            description: "Evaluate expression.",
            parameters: parameterObject,
            execute: async (argument: unknown, context: Context<Record<string, unknown>>) => {
                let result = "";

                const parameter = parameterObject.parse(argument);

                const { reportProgress, sessionId } = context;

                await reportProgress({ progress: 0, total: 100 });

                if (sessionId) {
                    result = mathExpression.execute(parameter.input).toString();
                }

                await reportProgress({ progress: 100, total: 100 });

                return result;
            }
        };
    };
}
