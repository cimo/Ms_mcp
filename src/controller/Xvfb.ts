import { exec, fork } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import Runtime from "./Runtime.js";
//import "./RuntimeWorker.js";

export default class Xvfb {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    // Method
    private display = (sessionId: string): number => {
        let result = Object.values(this.sessionObject).length - 1 + 1;

        this.sessionObject[sessionId] = {
            ...this.sessionObject[sessionId],
            display: result,
            runtime: undefined,
            runtimeWorker: undefined
        };

        return result;
    };

    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;
    }

    start = (sessionId: string): void => {
        const display = this.display(sessionId);

        helperSrc.writeLog("Xvfb.ts - start()", `Display: ${display} sessionId: ${sessionId}`);

        exec(`Xvfb :${display} -screen 0 1920x1080x24 >> "${helperSrc.PATH_ROOT}${helperSrc.PATH_LOG}xvfb.log" 2>&1`);

        const worker = fork(`${helperSrc.PATH_ROOT}dist/src/controller/RuntimeWorker.js`, [], {
            env: {
                ...process.env,
                DISPLAY: `:${display}`
            }
        });

        this.sessionObject[sessionId] = {
            ...this.sessionObject[sessionId],
            display,
            runtime: new Runtime(worker),
            runtimeWorker: worker
        };
    };

    stop = (sessionId: string): void => {
        if (this.sessionObject[sessionId] && this.sessionObject[sessionId].runtimeWorker) {
            const display = this.sessionObject[sessionId].display;

            helperSrc.writeLog("Xvfb.ts - stop()", `Display: ${display} sessionId: ${sessionId}`);

            this.sessionObject[sessionId].runtimeWorker.kill();

            exec(`pkill -f "Xvfb :${display}"`);

            exec(`rm -rf /tmp/.X11-unix/X${display}`);
            exec(`rm -rf /tmp/.X${display}-lock`);
        }
    };
}
