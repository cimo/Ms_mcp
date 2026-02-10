import { z } from "zod";
import type { Context, FastMCPSessionAuth } from "fastmcp";
import { exec } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";

export default class Automate {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    // Method
    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;
    }

    screenshot = () => {
        const parameterObject = z.object({});

        return {
            name: "tool_automate_screenshot",
            description: "Take display screenshot and return the image in base64.",
            parameters: parameterObject,
            execute: async (argument: unknown, context: Context<FastMCPSessionAuth>) => {
                let result = "";

                parameterObject.parse(argument);

                const { reportProgress, sessionId } = context;

                await reportProgress({ progress: 0, total: 100 });

                if (sessionId) {
                    result = await new Promise<string>((resolve, reject) => {
                        exec(
                            `DISPLAY=:${this.sessionObject[sessionId].display} npx tsx ${helperSrc.PATH_ROOT}src/tool/automate/Display.ts "screenshot"`,
                            (error, stdout) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(stdout);
                                }
                            }
                        );
                    });
                }

                await reportProgress({ progress: 100, total: 100 });

                return result;
            }
        };
    };

    browserOpen = () => {
        const parameterObject = z.object({ url: z.string().optional().describe("URL to open in the browser.") });

        return {
            name: "tool_automate_browser",
            description: "Open the browser application.",
            parameters: parameterObject,
            execute: async (argument: unknown, context: Context<FastMCPSessionAuth>) => {
                let result = "";

                const parameter = parameterObject.parse(argument);

                const { reportProgress, sessionId } = context;

                await reportProgress({ progress: 0, total: 100 });

                if (sessionId) {
                    result = await new Promise<string>((resolve, reject) => {
                        exec(
                            `pgrep -fa "chrome" | grep -- "display=:${this.sessionObject[sessionId].display}" | grep -- "--window-position" | awk '{print $1}' | xargs kill`,
                            (error, stdout) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(stdout);
                                }
                            }
                        );

                        exec(
                            `npx tsx "${helperSrc.PATH_ROOT}src/Chrome.ts" "${this.sessionObject[sessionId].display}" "${parameter.url}" >/dev/null 2>&1 &`,
                            (error, stdout) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(stdout);
                                }
                            }
                        );
                    });
                }

                await reportProgress({ progress: 100, total: 100 });

                return result;
            }
        };
    };
}
