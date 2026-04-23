import { fork } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import ControllerRuntime from "./Runtime.js";

export default class Xvfb {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    // Method
    private lastDisplay = (): number => {
        let result = 0;

        for (const session of Object.values(this.sessionObject)) {
            if (typeof session.display === "number" && session.display > result) {
                result = session.display;
            }
        }

        return result + 1;
    };

    constructor(sessionObject: Record<string, modelServer.Isession>) {
        this.sessionObject = sessionObject;
    }

    start = async (sessionId: string): Promise<void> => {
        const session = this.sessionObject[sessionId];

        if (session && session.runtimeWorker && typeof session.display === "number") {
            return;
        }

        const display = this.lastDisplay();

        helperSrc.writeLog("Xvfb.ts - start()", `Display: ${display} - sessionId: ${sessionId}`);

        await helperSrc.terminalExecution(`Xvfb :${display} -screen 0 1920x1080x24 >> "${helperSrc.PATH_ROOT}${helperSrc.PATH_LOG}xvfb.log" 2>&1`);

        const runtimeWorker = fork(`${helperSrc.PATH_ROOT}dist/src/controller/RuntimeWorker.js`, [], {
            silent: true,
            env: {
                ...process.env,
                DISPLAY: `:${display}`
            }
        });

        if (runtimeWorker.stdout) {
            runtimeWorker.stdout.on("data", (buffer: Buffer) => {
                helperSrc.writeLog("", buffer.toString("utf8"));
            });
        }

        if (runtimeWorker.stderr) {
            runtimeWorker.stderr.on("data", (buffer: Buffer) => {
                helperSrc.writeLog("", buffer.toString("utf8"));
            });
        }

        this.sessionObject[sessionId] = {
            ...this.sessionObject[sessionId],
            display,
            runtimeWorker,
            runtime: new ControllerRuntime(runtimeWorker)
        };
    };

    stop = async (sessionId: string): Promise<void> => {
        if (this.sessionObject[sessionId] && this.sessionObject[sessionId].runtimeWorker) {
            const display = this.sessionObject[sessionId].display;

            helperSrc.writeLog("Xvfb.ts - stop()", `Display: ${display} sessionId: ${sessionId}`);

            this.sessionObject[sessionId].runtimeWorker.kill();

            await helperSrc.terminalExecution(`pkill -f "Xvfb :${display}"`);

            await helperSrc.terminalExecution(`rm -rf /tmp/.X11-unix/X${display}`);
            await helperSrc.terminalExecution(`rm -rf /tmp/.X${display}-lock`);
        }
    };
}
