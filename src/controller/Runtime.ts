import { ChildProcess } from "child_process";

export default class Runtime {
    private worker: ChildProcess;

    constructor(worker: ChildProcess) {
        this.worker = worker;
    }

    private callWorker<T>(method: keyof Runtime, args: unknown[]): Promise<T> {
        return new Promise((resolve) => {
            const id = crypto.randomUUID();

            const handler = (msg: { id: string; result: unknown }) => {
                if (msg.id === id) {
                    this.worker.off("message", handler);

                    resolve(msg.result as T);
                }
            };
            this.worker.on("message", handler);
            this.worker.send({ id, method, args });
        });
    }

    screenshot() {
        return this.callWorker<string>("screenshot", []);
    }

    browserOpen(url: string | undefined) {
        return this.callWorker<string>("browserOpen", [url]);
    }

    mouseMove(x: number, y: number) {
        return this.callWorker<string>("mouseMove", [x, y]);
    }

    mouseClick(button: number) {
        return this.callWorker<string>("mouseClick", [button]);
    }
}
