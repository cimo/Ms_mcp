// Source
import * as automateDisplay from "../tool/automate/Display.js";
import * as automateMouse from "../tool/automate/Mouse.js";
import * as browserChrome from "../tool/browser/Chrome.js";
import * as documentParse from "../tool/document/Parse.js";

process.on("message", async (data: { id: string; tool: string; argumentList: unknown[] }) => {
    const { id, tool, argumentList } = data;

    let result = "";

    if (tool === "automateScreenshot") {
        result = await automateDisplay.screenshot();
    } else if (tool === "automateMouseMove") {
        await automateMouse.move(argumentList[0] as number, argumentList[1] as number);

        result = "ok";
    } else if (tool === "automateMouseClick") {
        await automateMouse.click(argumentList[0] as number);

        result = "ok";
    } else if (tool === "chromeExecute") {
        await browserChrome.execute(argumentList[0] as string | undefined);

        result = "ok";
    } else if (tool === "documentParse") {
        result = await documentParse.execute(argumentList[0] as string);
    }

    if (process.send) {
        process.send({ id, result });
    }
});
