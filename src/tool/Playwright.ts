import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import * as playwrightTester from "./playwright/Tester.js";

export default class Playwright {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchema;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchema = z.object({
            action: z
                .string()
                .default("")
                .describe("Is the word that indicates the action that the tool should perform. Can be ONLY 'listTest' or 'run' or 'listVideo'."),
            file: z.string().default("").describe("Is the word ending with '.spec.ts' and indicates the test filename that the tool should execute."),
            video: z.string().default("").describe("Used only when action is listVideo. Extract the video name keyword from the current prompt."),
            browser: z
                .string()
                .default("")
                .describe(
                    "If the word action is 'run' indicates the browser to use in the test execution. If is not provided the default value is 'desktop_chrome'."
                )
        });
    }

    execute = (): modelTool.Irpc<typeof this.inputSchema> => {
        const name = "playwright";

        const config = {
            description: ["Automate web test."].join("\n"),
            example: [
                "- Show the available test",
                "- Execute this test: 'Test.spec.ts' with this browser: 'desktop_chrome'",
                "- Show the video about: 'Test'"
            ].join("\n"),
            inputInstruction: [
                "You can receive ONLY 3 instructions (is impossible have more instructions on the same time) from the user prompt: number 1 is used for return the test list, number 2 is used for execute the test, number 3 is used for return the video list. For every request, extract arguments from the current prompt only, do not reuse file/video/browser from previous turns.",
                `1. You MUST need to extract, from the user prompt, ONLY the following schema: Parameter 1 action: ${this.inputSchema.shape.action.description}`,
                `2. You MUST need to extract, from the user prompt, ONLY the following schema: Parameter 1 action: ${this.inputSchema.shape.action.description}, Parameter 2 file: ${this.inputSchema.shape.file.description} and Parameter 3 browser: ${this.inputSchema.shape.browser.description}`,
                `3. You MUST need to extract, from the user prompt, ONLY the following schema: Parameter 1 action: ${this.inputSchema.shape.action.description}, Parameter 2 video: ${this.inputSchema.shape.video.description}`
            ].join("\n"),
            inputSchema: this.inputSchema
        };

        const content = async (argument: z.infer<typeof this.inputSchema>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const resultExecute = await playwrightTester.execute(argument.action, argument.file, argument.video, argument.browser);
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
