import ControllerChrome from "../controller/Chrome.js";
import * as automateDisplay from "../tool/automate/Display.js";
import * as automateMouse from "../tool/automate/Mouse.js";

const displayEnv = process.env["DISPLAY"];
if (!displayEnv) process.exit(1);

const controllerChrome = new ControllerChrome();

process.on("message", async (msg: { id: string; method: string; args: unknown[] }) => {
    const { id, method, args } = msg;

    let result: string = "";

    switch (method) {
        case "screenshot":
            result = await automateDisplay.screenshot();
            break;

        case "browserOpen":
            await controllerChrome.execute(args[0] as string | undefined);
            result = "ok";
            break;

        case "mouseMove":
            await automateMouse.move(args[0] as number, args[1] as number);
            result = "ok";
            break;

        case "mouseClick":
            await automateMouse.click(args[0] as number);
            result = "ok";
            break;
    }

    process.send?.({ id, result });
});
