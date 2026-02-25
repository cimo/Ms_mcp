import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelServer from "../model/Server.js";
import * as modelMcp from "../model/Mcp.js";
import ControllerUpload from "./Upload.js";
import ToolMath from "../tool/Math.js";
import ToolAutomate from "../tool/Automate.js";
import ToolBrowser from "../tool/Browser.js";
import ToolDocument from "../tool/Document.js";
import ToolOcr from "../tool/Ocr.js";
import ToolRag from "../tool/Rag.js";

export default class Mcp {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private sessionObject: Record<string, modelServer.Isession>;
    private controllerUpload: ControllerUpload;

    private serverName: string;
    private serverVersion: string;

    private toolMath: ToolMath;
    private toolAutomate: ToolAutomate;
    private toolBrowser: ToolBrowser;
    private toolDocument: ToolDocument;
    private toolOcr: ToolOcr;
    private toolRag: ToolRag;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler, sessionObject: Record<string, modelServer.Isession>) {
        this.app = app;
        this.limiter = limiter;
        this.sessionObject = sessionObject;
        this.controllerUpload = new ControllerUpload();

        this.serverName = "Microservice mcp";
        this.serverVersion = "1.0.0";

        this.toolMath = new ToolMath(this.sessionObject);
        this.toolAutomate = new ToolAutomate(this.sessionObject);
        this.toolBrowser = new ToolBrowser(this.sessionObject);
        this.toolDocument = new ToolDocument(this.sessionObject);
        this.toolOcr = new ToolOcr(this.sessionObject);
        this.toolRag = new ToolRag(this.sessionObject);
    }

    login = async (response: Response): Promise<string> => {
        const cookie = response.getHeader("set-cookie");

        if (typeof cookie === "string") {
            return instance.api
                .post(
                    "/rpc",
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json, text/event-stream",
                            Cookie: cookie
                        }
                    },
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "initialize",
                        params: {
                            protocolVersion: "2025-06-18",
                            capabilities: {},
                            clientInfo: {
                                name: "curl",
                                version: "1.0"
                            }
                        }
                    },
                    false,
                    true
                )
                .then((result) => {
                    const sessionId = result.headers.get("mcp-session-id");

                    return sessionId ? sessionId : "";
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Mcp.ts - login() - catch()", error);

                    return "ko";
                });
        } else {
            return "ko";
        }
    };

    logout = async (request: Request): Promise<string> => {
        const cookie = request.headers["cookie"];
        const sessionId = request.headers["mcp-session-id"];

        if (typeof cookie === "string" && typeof sessionId === "string") {
            return instance.api
                .post(
                    "/rpc",
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json, text/event-stream",
                            Cookie: cookie,
                            "mcp-session-id": sessionId
                        }
                    },
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "terminate",
                        params: {
                            protocolVersion: "2025-06-18",
                            capabilities: {},
                            clientInfo: {
                                name: "curl",
                                version: "1.0"
                            }
                        }
                    }
                )
                .then(() => {
                    return sessionId;
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Mcp.ts - logout() - catch()", error);

                    return "ko";
                });
        }

        return "ko";
    };

    toolRegistartion = (server: McpServer): void => {
        server.registerTool(this.toolMath.expression().name, this.toolMath.expression().config, this.toolMath.expression().content);
        server.registerTool(this.toolAutomate.screenshot().name, this.toolAutomate.screenshot().config, this.toolAutomate.screenshot().content);
        server.registerTool(this.toolAutomate.mouseMove().name, this.toolAutomate.mouseMove().config, this.toolAutomate.mouseMove().content);
        server.registerTool(this.toolAutomate.mouseClick().name, this.toolAutomate.mouseClick().config, this.toolAutomate.mouseClick().content);
        server.registerTool(this.toolBrowser.chromeExecute().name, this.toolBrowser.chromeExecute().config, this.toolBrowser.chromeExecute().content);
        server.registerTool(this.toolDocument.parse().name, this.toolDocument.parse().config, this.toolDocument.parse().content);
        server.registerTool(this.toolOcr.execute().name, this.toolOcr.execute().config, this.toolOcr.execute().content);
        server.registerTool(this.toolRag.execute().name, this.toolRag.execute().config, this.toolRag.execute().content);
    };

    api = (): void => {
        this.app.post("/rpc", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (request.body.method === "initialize") {
                const sessionIdNew = helperSrc.generateUniqueId();

                const rpc = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => sessionIdNew,
                    enableJsonResponse: true
                });

                this.sessionObject[sessionIdNew] = {
                    ...this.sessionObject[sessionIdNew],
                    rpc
                };

                const server = new McpServer({
                    name: this.serverName,
                    version: this.serverVersion
                });

                this.toolRegistartion(server);

                await server.connect(rpc);

                await this.sessionObject[sessionIdNew].rpc.handleRequest(request, response, request.body);

                return;
            } else if (typeof sessionId === "string" && request.body.method === "terminate") {
                this.sessionObject[sessionId].rpc.close();

                helperSrc.responseBody(sessionId, "", response, 200);

                return;
            }

            if (typeof sessionId === "string") {
                await this.sessionObject[sessionId].rpc.handleRequest(request, response, request.body);
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/rpc) - Error", "Session ID is missing or invalid.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/rpc", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId === "string") {
                await this.sessionObject[sessionId].rpc.handleRequest(request, response);
            } else {
                helperSrc.writeLog("Mcp.ts - api() - get(/rpc) - Error", "Session ID is missing or invalid.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/tool-call", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const contentType = request.headers["content-type"];
            const cookie = request.headers["cookie"];
            const sessionId = request.headers["mcp-session-id"];

            if (typeof contentType === "string" && typeof cookie === "string" && typeof sessionId === "string") {
                if (contentType.includes("multipart/form-data")) {
                    this.controllerUpload
                        .execute(request, true)
                        .then(() => {
                            helperSrc.responseBody("ok", "", response, 200);
                        })
                        .catch((error: Error) => {
                            helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-call) - controllerUpload - execute() - catch()", error);

                            helperSrc.responseBody("", "ko", response, 500);
                        });
                } else {
                    instance.api
                        .post<string>(
                            "/rpc",
                            {
                                headers: {
                                    "Content-Type": "application/json",
                                    Accept: "application/json, text/event-stream",
                                    Cookie: cookie,
                                    "mcp-session-id": sessionId
                                }
                            },
                            request.body
                        )
                        .then((result) => {
                            helperSrc.responseBody(result, "", response, 200);
                        })
                        .catch((error: Error) => {
                            helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-call) - post(/rpc) - catch()", error);

                            helperSrc.responseBody("", "ko", response, 500);
                        });
                }
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-call) - Error", "Missing or invalid headers.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/tool-task", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId === "string") {
                const runtime = this.sessionObject[sessionId].runtime;

                if (runtime) {
                    if (typeof request.body === "object") {
                        const body = request.body as modelMcp.ItoolTask;

                        for (const step of body.stepList) {
                            if (step.action === "chrome_execute") {
                                await runtime.chromeExecute(sessionId, step.argumentObject["url"]);
                            }

                            /*if (step.action === "automate_mouse_move") {
                                await runtime.automateMouseMove(sessionId, parseInt(step.argumentObject["x"]), parseInt(step.argumentObject["y"]));
                            }

                            if (step.action === "automate_mouse_click") {
                                await runtime.automateMouseClick(sessionId, parseInt(step.argumentObject["button"]));
                            }*/
                        }

                        let ocrResult = "[]";

                        while (ocrResult === "[]") {
                            await runtime.automateScreenshot(sessionId);

                            ocrResult = await runtime.ocrExecute(sessionId, "-", `${sessionId}.jpg`, "-", "data");

                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                    }

                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-task) - Error", "Runtime problem.");

                    helperSrc.responseBody("", "ko", response, 500);
                }
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-task) - Error", "Missing or invalid headers.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
