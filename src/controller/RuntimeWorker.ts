// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelMcp from "../model/Mcp.js";
import * as automateDisplay from "../tool/automate/Display.js";
import * as automateMouse from "../tool/automate/Mouse.js";
import * as browserChrome from "../tool/browser/Chrome.js";
import * as ocrExtract from "../tool/ocr/Extract.js";

process.on("message", async (data: modelMcp.IruntimeWorkerMessageData) => {
    let resultProcess = {} as modelMcp.IruntimeHandlerData;

    if (data.tool === "automateScreenshot") {
        await automateDisplay
            .screenshot(data.sessionId)
            .then((result) => {
                resultProcess = { id: data.id, result };

                if (process.send) {
                    process.send(resultProcess);
                }
            })
            .catch((error: Error) => {
                resultProcess = { ...resultProcess, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - automateScreenshot - catch()", error.message);

                    process.send(resultProcess);
                }
            });

        return;
    } else if (data.tool === "automateMouseMove") {
        await automateMouse
            .move(data.argumentList[0] as number, data.argumentList[1] as number)
            .then(() => {
                resultProcess = { id: data.id, result: "ok" };

                if (process.send) {
                    process.send(resultProcess);
                }
            })
            .catch((error: Error) => {
                resultProcess = { ...resultProcess, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - automateMouseMove - catch()", error.message);

                    process.send(resultProcess);
                }
            });

        return;
    } else if (data.tool === "automateMouseClick") {
        await automateMouse
            .click(data.argumentList[0] as number)
            .then(() => {
                resultProcess = { id: data.id, result: "ok" };

                if (process.send) {
                    process.send(resultProcess);
                }
            })
            .catch((error: Error) => {
                resultProcess = { ...resultProcess, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - automateMouseClick - catch()", error.message);

                    process.send(resultProcess);
                }
            });

        return;
    } else if (data.tool === "chromeExecute") {
        await browserChrome
            .execute(data.argumentList[0] as string)
            .then(() => {
                resultProcess = { id: data.id, result: "ok" };

                if (process.send) {
                    process.send(resultProcess);
                }
            })
            .catch((error: Error) => {
                resultProcess = { ...resultProcess, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - chromeExecute - catch()", error.message);

                    process.send(resultProcess);
                }
            });

        return;
    } else if (data.tool === "ocrExecute") {
        await ocrExtract
            .execute(data.argumentList[0] as string, data.argumentList[1] as string, data.argumentList[2] as string, data.argumentList[3] as string)
            .then((result) => {
                resultProcess = { id: data.id, result };

                if (process.send) {
                    process.send(resultProcess);
                }
            })
            .catch((error: Error) => {
                resultProcess = { ...resultProcess, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - ocrExecute - catch()", error.message);

                    process.send(resultProcess);
                }
            });

        return;
    }

    if (process.send) {
        process.send(resultProcess);
    }
});
