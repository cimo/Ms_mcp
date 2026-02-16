import { z } from "zod";
import { exec } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import ControllerChrome from "../controller/Chrome.js";

export default class Automate {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    private inputSchemaScreenshot;
    private inputSchemaBrowserOpen;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;

        this.inputSchemaScreenshot = z.object({});
        this.inputSchemaBrowserOpen = z.object({ url: z.string().optional().describe("URL to open in the browser.") });
    }

    screenshot = () => {
        const name = "tool_automate_screenshot";

        const config = {
            description: "Take display screenshot and return the image in base64.",
            inputSchema: this.inputSchemaScreenshot
        };

        const content = async (_: z.infer<typeof this.inputSchemaScreenshot>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                exec(
                    `DISPLAY=:${this.sessionObject[extra.sessionId].display} npx tsx ${helperSrc.PATH_ROOT}src/tool/automate/Display.ts "screenshot"`,
                    (_, stdout, stderr) => {
                        if ((stdout !== "" && stderr === "") || (stdout !== "" && stderr !== "")) {
                            result = stdout;
                        }
                    }
                );
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

    browserOpen = () => {
        const name = "tool_automate_browser";

        const config = {
            description: "Open the browser chrome application.",
            inputSchema: this.inputSchemaBrowserOpen
        };

        const content = async (argument: z.infer<typeof this.inputSchemaBrowserOpen>, extra: { sessionId?: string }) => {
            let result = "";

            if (extra.sessionId && this.sessionObject[extra.sessionId]) {
                const controllerChrome = new ControllerChrome();

                exec(
                    `pgrep -fa "chrome" | grep -- "display=:${this.sessionObject[extra.sessionId].display}" | grep -- "--window-position" | awk '{print $1}' | xargs kill`
                );

                controllerChrome.execute(this.sessionObject[extra.sessionId].display, argument.url).catch((error: Error) => {
                    helperSrc.writeLog("Automate.ts - controllerChrome.execute() - catch()", error);
                });
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
