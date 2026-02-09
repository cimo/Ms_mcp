import { FastMCP } from "fastmcp";

// Source
import * as helperSrc from "./HelperSrc.js";
import * as modelMain from "./model/Main.js";
import Xvfb from "./Xvfb.js";
import Math from "./tool/Math.js";
import Automate from "./tool/Automate.js";

const userObject: Record<string, modelMain.Isession> = {};

const xvfb = new Xvfb(userObject);

const math = new Math();
const automate = new Automate(userObject);

const server = new FastMCP<Record<string, unknown>>({
    name: "Microservice mcp",
    version: "1.0.0"
});

server.addTool(math.expression());
server.addTool(automate.screenshot());
server.addTool(automate.browserOpen());
//server.addTool(toolAutomateMouseMove);
//server.addTool(toolAutomateMouseClick);
//server.addTool(toolAutomateOcr);

server.start({
    transportType: "httpStream",
    httpStream: {
        host: "localhost",
        port: helperSrc.SERVER_PORT as unknown as number,
        endpoint: "/mcp",
        stateless: false
    }
});

const app = server.getApp();

app.use("/xvfb-start", async (handler) => {
    const sessionId = handler.req.header("X-Mcp-Session-Id");

    if (sessionId) {
        xvfb.start(sessionId);
    }

    return handler.json({ stdout: "ok" });
});

app.use("/xvfb-stop", async (handler) => {
    const sessionId = handler.req.header("X-Mcp-Session-Id");

    if (sessionId) {
        xvfb.stop(sessionId);
    }

    return handler.json({ stdout: "ok" });
});

helperSrc.keepProcess();
