import { z } from "zod";

// Source
import * as modelServer from "../model/Server.js";

export default class Automate {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchemaScreenshot;
    private inputSchemaMouseMove;
    private inputSchemaMouseClick;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaScreenshot = z.object({});
        this.inputSchemaMouseMove = z.object({ x: z.number().describe("X coordinate."), y: z.number().describe("Y coordinate.") });
        this.inputSchemaMouseClick = z.object({
            button: z.number().int().min(0).max(2).describe("Left: 0 - Middle: 1 - Right: 2")
        });
    }

    screenshot = () => {
        const name = "automate_screenshot";

        const config = {
            description: "Take display screenshot and return the image in base64.",
            inputSchema: this.inputSchemaScreenshot
        };

        const content = async (_: z.infer<typeof this.inputSchemaScreenshot>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    result = await runtime.automateScreenshot(extra.sessionId);
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

    mouseMove = () => {
        const name = "automate_mouse_move";

        const config = {
            description: "Move mouse cursor to specific coordinates.",
            inputSchema: this.inputSchemaMouseMove
        };

        const content = async (argument: z.infer<typeof this.inputSchemaMouseMove>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    result = await runtime.automateMouseMove(extra.sessionId, argument.x, argument.y);
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

    mouseClick = () => {
        const name = "automate_mouse_click";

        const config = {
            description: "Click the specific mouse button.",
            inputSchema: this.inputSchemaMouseClick
        };

        const content = async (argument: z.infer<typeof this.inputSchemaMouseClick>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const runtime = this.sessionObject[extra.sessionId].runtime;

                if (runtime) {
                    result = await runtime.automateMouseClick(extra.sessionId, argument.button);
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
