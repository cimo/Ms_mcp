import { exec } from "child_process";

// Source
import * as helperSrc from "./HelperSrc.js";
import * as modelMain from "./model/Main.js";

export default class Xvfb {
    // Variable
    private sessionObject: Record<string, modelMain.Isession>;

    // Method
    private display = (sessionId: string): number => {
        let result = 1;

        const valueList = Object.values(this.sessionObject);

        if (valueList.length > 0) {
            const last = valueList[valueList.length - 1];

            result = last.display + 1;
        }

        this.sessionObject[sessionId] = {
            ...this.sessionObject[sessionId],
            display: result
        };

        return result;
    };

    constructor(sessionObject: Record<string, modelMain.Isession>) {
        this.sessionObject = sessionObject;
    }

    start = (sessionId: string): void => {
        const display = this.display(sessionId);

        helperSrc.writeLog("Xvfb.ts - start()", `Display: ${display} uniqueId: ${sessionId}`);

        exec(`Xvfb :${display} -screen 0 1920x1080x24 >> "${helperSrc.PATH_ROOT}${helperSrc.PATH_LOG}xvfb.log" 2>&1`);
    };

    stop = (sessionId: string): void => {
        const display = this.sessionObject[sessionId].display;

        helperSrc.writeLog("Xvfb.ts - stop()", `Display: ${display} uniqueId: ${sessionId}`);

        exec(`pkill -f "Xvfb :${display}"`);

        delete this.sessionObject[sessionId];
    };
}
