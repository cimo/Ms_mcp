// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelRuntime from "../model/Runtime.js";
import * as automateDisplay from "../tool/automate/Display.js";
import * as automateMouse from "../tool/automate/Mouse.js";
import * as browserChrome from "../tool/browser/Chrome.js";
import * as ocrExtractor from "../tool/ocr/Extractor.js";

process.on("message", (data: modelRuntime.IdataWorkerMessage) => {
    let resultProcessObject = {} as modelRuntime.IdataHandler;

    if (data.tool === "automateScreenshot") {
        automateDisplay
            .screenshot(data.mcpSessionId)
            .then((result) => {
                resultProcessObject = { id: data.id, result };

                if (process.send) {
                    process.send(resultProcessObject);
                }
            })
            .catch((error: Error) => {
                resultProcessObject = { ...resultProcessObject, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - automateScreenshot - catch()", error.message);

                    process.send(resultProcessObject);
                }
            });

        return;
    } else if (data.tool === "automateMouseMove") {
        automateMouse
            .move(data.argumentList[0] as number, data.argumentList[1] as number)
            .then(() => {
                resultProcessObject = { id: data.id, result: "ok" };

                if (process.send) {
                    process.send(resultProcessObject);
                }
            })
            .catch((error: Error) => {
                resultProcessObject = { ...resultProcessObject, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - automateMouseMove - catch()", error.message);

                    process.send(resultProcessObject);
                }
            });

        return;
    } else if (data.tool === "automateMouseClick") {
        automateMouse
            .click(data.argumentList[0] as number)
            .then(() => {
                resultProcessObject = { id: data.id, result: "ok" };

                if (process.send) {
                    process.send(resultProcessObject);
                }
            })
            .catch((error: Error) => {
                resultProcessObject = { ...resultProcessObject, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - automateMouseClick - catch()", error.message);

                    process.send(resultProcessObject);
                }
            });

        return;
    } else if (data.tool === "browserChrome") {
        browserChrome
            .execute(data.argumentList[0] as string)
            .then(() => {
                resultProcessObject = { id: data.id, result: "ok" };

                if (process.send) {
                    process.send(resultProcessObject);
                }
            })
            .catch((error: Error) => {
                resultProcessObject = { ...resultProcessObject, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - browserChrome - catch()", error.message);

                    process.send(resultProcessObject);
                }
            });

        return;
    } else if (data.tool === "ocrExecute") {
        ocrExtractor
            .execute(
                data.mcpSessionId,
                data.argumentList[0] as string,
                data.argumentList[1] as string,
                data.argumentList[2] as string,
                data.argumentList[3] as string
            )
            .then((result) => {
                resultProcessObject = { id: data.id, result };

                if (process.send) {
                    process.send(resultProcessObject);
                }
            })
            .catch((error: Error) => {
                resultProcessObject = { ...resultProcessObject, error: `Process ${data.tool} failed.` };

                if (process.send) {
                    helperSrc.writeLog("RuntimeWorker.ts - process.on(message) - ocrExecute - catch()", error.message);

                    process.send(resultProcessObject);
                }
            });

        return;
    }

    if (process.send) {
        process.send(resultProcessObject);
    }
});
