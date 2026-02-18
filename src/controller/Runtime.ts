import { ChildProcess } from "child_process";

export default class Runtime {
    private runtimeWorker: ChildProcess;

    constructor(runtimeWorker: ChildProcess) {
        this.runtimeWorker = runtimeWorker;
    }

    private callRuntimeWorker<T>(tool: keyof Runtime, argumentList: unknown[]): Promise<T> {
        return new Promise((resolve) => {
            const id = crypto.randomUUID();

            const handler = (data: { id: string; result: unknown }) => {
                if (data.id === id) {
                    this.runtimeWorker.off("message", handler);

                    resolve(data.result as T);
                }
            };

            this.runtimeWorker.on("message", handler);

            this.runtimeWorker.send({ id, tool, argumentList });
        });
    }

    automateScreenshot() {
        return this.callRuntimeWorker<string>("automateScreenshot", []);
    }

    automateMouseMove(x: number, y: number) {
        return this.callRuntimeWorker<string>("automateMouseMove", [x, y]);
    }

    automateMouseClick(button: number) {
        return this.callRuntimeWorker<string>("automateMouseClick", [button]);
    }

    chromeExecute(url: string | undefined) {
        return this.callRuntimeWorker<string>("chromeExecute", [url]);
    }

    documentParse(fileName: string) {
        return this.callRuntimeWorker<string>("documentParse", [fileName]);
    }

    ocrExecute() {
        return this.callRuntimeWorker<string>("ocrExecute", []);
    }
}
