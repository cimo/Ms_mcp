import { z } from "zod";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";

export default class Automate {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    inputSchemaScrreenshot;
    inputSchemaMouseMove;
    inputSchemaMouseClick;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaScrreenshot = z.object({});
        this.inputSchemaMouseMove = z.object({
            x: z.union([z.number(), z.string(), z.null()]).default(0).describe("X coordinate."),
            y: z.union([z.number(), z.string(), z.null()]).default(0).describe("Y coordinate.")
        });
        this.inputSchemaMouseClick = z.object({
            button: z.union([z.number(), z.string(), z.null()]).default(0).describe("Left: 0 - Middle: 1 - Right: 2")
        });
    }

    screenshot = (): modelTool.Irpc<typeof this.inputSchemaScrreenshot> => {
        const name = "automate_screenshot";

        const config = {
            description: ["Take display screenshot and return the image in base64."].join("\n"),
            example: [""].join("\n"),
            inputInstruction: [].join("\n"),
            inputSchema: this.inputSchemaScrreenshot
        };

        const content = async (_: z.infer<typeof this.inputSchemaScrreenshot>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    const resultRuntime = await runtime.automateScreenshot(extra.sessionId);
                    result = JSON.stringify({ name, result: resultRuntime });
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

    mouseMove = (): modelTool.Irpc<typeof this.inputSchemaMouseMove> => {
        const name = "automate_mouse_move";

        const config = {
            description: ["Move mouse cursor to specific coordinates."].join("\n"),
            example: [""].join("\n"),
            inputInstruction: [].join("\n"),
            inputSchema: this.inputSchemaMouseMove
        };

        const content = async (argument: z.infer<typeof this.inputSchemaMouseMove>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    const resultRuntime = await runtime.automateMouseMove(
                        extra.sessionId,
                        helperSrc.zodNumber(argument.x, 0),
                        helperSrc.zodNumber(argument.y, 0)
                    );
                    result = JSON.stringify({ name, result: resultRuntime });
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

    mouseClick = (): modelTool.Irpc<typeof this.inputSchemaMouseClick> => {
        const name = "automate_mouse_click";

        const config = {
            description: ["Click the specific mouse button."].join("\n"),
            example: [""].join("\n"),
            inputInstruction: [].join("\n"),
            inputSchema: this.inputSchemaMouseClick
        };

        const content = async (argument: z.infer<typeof this.inputSchemaMouseClick>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    const resultRuntime = await runtime.automateMouseClick(
                        extra.sessionId,
                        Math.trunc(helperSrc.zodNumber(argument.button, 0, 0, 2))
                    );
                    result = JSON.stringify({ name, result: resultRuntime });
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
