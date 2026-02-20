import { ChildProcess } from "child_process";

export default class Runtime {
    private runtimeWorker: ChildProcess;

    constructor(runtimeWorker: ChildProcess) {
        this.runtimeWorker = runtimeWorker;
    }

    private callRuntimeWorker<T>(sessionId: string, tool: keyof Runtime, argumentList: unknown[]): Promise<T> {
        return new Promise((resolve) => {
            const id = crypto.randomUUID();

            /*const timeout = setTimeout(() => {
                this.runtimeWorker.off("message", handler);

                reject(new Error("runtimeWorker timeout"));
            }, 15000);*/

            const handler = (data: { id: string; result: unknown }) => {
                if (data.id === id) {
                    //clearTimeout(timeout);

                    this.runtimeWorker.off("message", handler);

                    resolve(data.result as T);
                }
            };

            this.runtimeWorker.on("message", handler);

            this.runtimeWorker.send({ id, sessionId, tool, argumentList });
        });
    }

    automateScreenshot(sessionId: string) {
        return this.callRuntimeWorker<string>(sessionId, "automateScreenshot", []);
    }

    automateMouseMove(sessionId: string, x: number, y: number) {
        return this.callRuntimeWorker<string>(sessionId, "automateMouseMove", [x, y]);
    }

    automateMouseClick(sessionId: string, button: number) {
        return this.callRuntimeWorker<string>(sessionId, "automateMouseClick", [button]);
    }

    chromeExecute(sessionId: string, url: string) {
        return this.callRuntimeWorker<string>(sessionId, "chromeExecute", [url]);
    }

    ocrExecute(sessionId: string, language: string, fileName: string, searchText: string, mode: string) {
        return this.callRuntimeWorker<string>(sessionId, "ocrExecute", [language, fileName, searchText, mode]);
    }
}
