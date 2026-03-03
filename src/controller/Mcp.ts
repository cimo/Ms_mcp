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
import ToolAutomate from "../tool/Automate.js";
import ToolBrowser from "../tool/Browser.js";
import ToolDocument from "../tool/Document.js";
import ToolMath from "../tool/Math.js";
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

    private toolAutomate: ToolAutomate;
    private toolBrowser: ToolBrowser;
    private toolDocument: ToolDocument;
    private toolMath: ToolMath;
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

        this.toolAutomate = new ToolAutomate(this.sessionObject);
        this.toolBrowser = new ToolBrowser(this.sessionObject);
        this.toolDocument = new ToolDocument(this.sessionObject);
        this.toolMath = new ToolMath(this.sessionObject);
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
                    helperSrc.writeLog("Mcp.ts - login() - catch()", error.message);

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
                    helperSrc.writeLog("Mcp.ts - logout() - catch()", error.message);

                    return "ko";
                });
        }

        return "ko";
    };

    toolRegistartion = (server: McpServer): void => {
        server.registerTool(this.toolAutomate.mouseClick().name, this.toolAutomate.mouseClick().config, this.toolAutomate.mouseClick().content);
        server.registerTool(this.toolAutomate.mouseMove().name, this.toolAutomate.mouseMove().config, this.toolAutomate.mouseMove().content);
        server.registerTool(this.toolAutomate.screenshot().name, this.toolAutomate.screenshot().config, this.toolAutomate.screenshot().content);
        server.registerTool(this.toolBrowser.chrome().name, this.toolBrowser.chrome().config, this.toolBrowser.chrome().content);
        server.registerTool(this.toolDocument.parser().name, this.toolDocument.parser().config, this.toolDocument.parser().content);
        server.registerTool(this.toolMath.expression().name, this.toolMath.expression().config, this.toolMath.expression().content);
        server.registerTool(this.toolOcr.execute().name, this.toolOcr.execute().config, this.toolOcr.execute().content);
        server.registerTool(this.toolRag.search().name, this.toolRag.search().config, this.toolRag.search().content);
    };

    rpc = (): void => {
        this.app.post("/rpc", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId !== "string" && request.body.method === "initialize") {
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

                this.toolRag.remove().content({}, { sessionId });

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
    };

    api = (): void => {
        this.app.post("/api/upload", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/`;

                this.controllerUpload
                    .execute(request, true, input)
                    .then((result) => {
                        const fileName = result[0].fileName;

                        /*const fileExtension = fileName.split(".").pop();

                        if (fileExtension && fileExtension.toLowerCase() === "pdf") {
                            this.toolDocument
                                .parser()
                                .content({ fileName, format: "markdown" }, { sessionId })
                                .then((resultDocumentParser) => {
                                    this.toolRag
                                        .store()
                                        .content({ fileContent: resultDocumentParser.content[0].text }, { sessionId })
                                        .then(() => {
                                            const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${fileName}.lock`;

                                            helperSrc.fileWriteStream(input, Buffer.from([]), () => {});
                                        });
                                });
                        }*/

                        helperSrc.responseBody(fileName, "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Mcp.ts - api() - post(/api/upload) - controllerUpload - execute() - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/upload) - Error", "Missing or invalid headers.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/tool-list", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const toolList = [
                {
                    name: this.toolDocument.parser().name,
                    argumentObject: this.toolDocument.inputSchema.parse({})
                },
                {
                    name: this.toolMath.expression().name,
                    argumentObject: this.toolMath.inputSchema.parse({})
                },
                {
                    name: this.toolOcr.execute().name,
                    argumentObject: this.toolOcr.inputSchema.parse({})
                },
                {
                    name: this.toolRag.search().name,
                    argumentObject: this.toolRag.inputSchemaSearch.parse({})
                }
            ];

            helperSrc.responseBody(JSON.stringify(toolList), "", response, 200);
        });

        this.app.post("/api/tool-call", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const cookie = request.headers["cookie"];
            const sessionId = request.headers["mcp-session-id"];

            if (typeof cookie === "string" && typeof sessionId === "string") {
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
                        helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-call) - post(/rpc) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-call) - Error", "Missing or invalid headers.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/tool-task", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];
            const body = request.body as modelMcp.ItoolTask;

            if (typeof sessionId === "string") {
                const runtime = this.sessionObject[sessionId].runtime;

                if (runtime) {
                    if (typeof request.body === "object") {
                        for (const tool of body.list) {
                            if (tool.name === "chrome") {
                                await runtime.chrome(sessionId, tool.argumentObject["url"]);
                            }

                            /*if (tool.name === "automate_mouse_move") {
                                await runtime.automateMouseMove(sessionId, parseInt(tool.argumentObject["x"]), parseInt(tool.argumentObject["y"]));
                            }

                            if (tool.name === "automate_mouse_click") {
                                await runtime.automateMouseClick(sessionId, parseInt(tool.argumentObject["button"]));
                            }*/
                        }

                        let ocrResult = "[]";

                        while (ocrResult === "[]") {
                            await runtime.automateScreenshot(sessionId);

                            ocrResult = await runtime.ocrExecute(sessionId, "", `${sessionId}.jpg`, "", "data");

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
