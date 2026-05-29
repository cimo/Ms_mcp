import { ChildProcess } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelMcp from "../model/Mcp.js";

export default class Runtime {
    private runtimeWorker: ChildProcess;

    constructor(runtimeWorker: ChildProcess) {
        this.runtimeWorker = runtimeWorker;
    }

    private callRuntimeWorker(mcpSessionId: string, tool: keyof Runtime, argumentList: unknown[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.runtimeWorker.off("message", handler);

                reject(new Error("Timeout."));

                return;
            }, 60000);

            const id = crypto.randomUUID();

            const handler = (data: modelMcp.IruntimeHandlerData) => {
                if (data.id === id) {
                    clearTimeout(timeout);

                    this.runtimeWorker.off("message", handler);

                    if (data.result) {
                        resolve(data.result);

                        return;
                    } else if (data.error) {
                        helperSrc.writeLog("Runtime.ts - callRuntimeWorker() - handler() - Error", data.error);

                        reject(new Error("Data error."));

                        return;
                    }
                }
            };

            this.runtimeWorker.on("message", handler);

            this.runtimeWorker.send({ id, mcpSessionId, tool, argumentList });
        });
    }

    async automateScreenshot(mcpSessionId: string): Promise<string> {
        return this.callRuntimeWorker(mcpSessionId, "automateScreenshot", []).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - automateScreenshot() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async automateMouseMove(mcpSessionId: string, x: number, y: number): Promise<string> {
        return this.callRuntimeWorker(mcpSessionId, "automateMouseMove", [x, y]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - automateMouseMove() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async automateMouseClick(mcpSessionId: string, button: number): Promise<string> {
        return this.callRuntimeWorker(mcpSessionId, "automateMouseClick", [button]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - automateMouseClick() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async chrome(mcpSessionId: string, url: string): Promise<string> {
        return this.callRuntimeWorker(mcpSessionId, "chrome", [url]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - chrome() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async ocrExecute(mcpSessionId: string, language: string, fileName: string, searchText: string, mode: string): Promise<string> {
        return this.callRuntimeWorker(mcpSessionId, "ocrExecute", [language, fileName, searchText, mode]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - ocrExecute() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }
}
