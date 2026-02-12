import { z } from "zod";
import type { Context, FastMCPSessionAuth } from "fastmcp";

// Source
import * as mathExpression from "./math/Expression.js";
import * as modelServer from "../model/Server.js";

export default class Math {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;
    }

    expression = () => {
        const parameterObject = z.object({
            input: z.string().describe("A math expression, example: '3 + 4 * (2 - 1) ^ 3 / 2'")
        });

        return {
            name: "tool_math_expression",
            description: "Evaluate expression.",
            parameters: parameterObject,
            execute: async (argument: unknown, context: Context<FastMCPSessionAuth>) => {
                let result = "";

                const parameter = parameterObject.parse(argument);

                const { reportProgress } = context;

                await reportProgress({ progress: 0, total: 100 });

                result = mathExpression.execute(parameter.input).toString();

                await reportProgress({ progress: 100, total: 100 });

                return result;
            }
        };
    };
}
