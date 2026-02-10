import { exec } from "child_process";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";

export default class Xvfb {
    // Variable
    private sessionObject: Record<string, modelServer.Isession>;

    // Method
    private display = (sessionId: string): number => {
        let result = Object.values(this.sessionObject).length - 1 + 1;

        this.sessionObject[sessionId] = {
            ...this.sessionObject[sessionId],
            display: result
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
    };

    stop = (sessionId: string): void => {
        if (this.sessionObject[sessionId]) {
            const display = this.sessionObject[sessionId].display;

            helperSrc.writeLog("Xvfb.ts - stop()", `Display: ${display} sessionId: ${sessionId}`);

            exec(`pkill -f "Xvfb :${display}"`);

            exec(`rm -rf /tmp/.X11-unix/X${display}`);
            exec(`rm -rf /tmp/.X${display}-lock`);
        }
    };
}
