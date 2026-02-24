import { ChildProcess } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelMcp from "../model/Mcp.js";

export default class Runtime {
    private runtimeWorker: ChildProcess;

    constructor(runtimeWorker: ChildProcess) {
        this.runtimeWorker = runtimeWorker;
    }

    private callRuntimeWorker(sessionId: string, tool: keyof Runtime, argumentList: unknown[]): Promise<string> {
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

            this.runtimeWorker.send({ id, sessionId, tool, argumentList });
        });
    }

    async automateScreenshot(sessionId: string): Promise<string> {
        return this.callRuntimeWorker(sessionId, "automateScreenshot", []).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - automateScreenshot() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async automateMouseMove(sessionId: string, x: number, y: number): Promise<string> {
        return this.callRuntimeWorker(sessionId, "automateMouseMove", [x, y]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - automateMouseMove() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async automateMouseClick(sessionId: string, button: number): Promise<string> {
        return this.callRuntimeWorker(sessionId, "automateMouseClick", [button]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - automateMouseClick() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async chromeExecute(sessionId: string, url: string): Promise<string> {
        return this.callRuntimeWorker(sessionId, "chromeExecute", [url]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - chromeExecute() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }

    async ocrExecute(sessionId: string, language: string, fileName: string, searchText: string, mode: string): Promise<string> {
        return this.callRuntimeWorker(sessionId, "ocrExecute", [language, fileName, searchText, mode]).catch((error: Error) => {
            helperSrc.writeLog("Runtime.ts - ocrExecute() - callRuntimeWorker() - catch()", error.message);

            return "ko";
        });
    }
}
