import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import ToolAutomate from "../tool/Automate.js";
import ToolBrowser from "../tool/Browser.js";
import ToolDocument from "../tool/Document.js";
import ToolMath from "../tool/Math.js";
import ToolOcr from "../tool/Ocr.js";
import ToolRag from "../tool/Rag.js";
import ToolSecurity from "../tool/Security.js";
import ToolPlaywright from "../tool/Playwright.js";

export default class Tool {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private sessionObject: Record<string, modelServer.Isession>;

    private serverName: string;
    private serverVersion: string;

    private toolAutomate: ToolAutomate;
    private toolBrowser: ToolBrowser;
    private toolDocument: ToolDocument;
    private toolMath: ToolMath;
    private toolOcr: ToolOcr;
    private toolRag: ToolRag;
    private toolSecurity: ToolSecurity;
    private toolPlaywright: ToolPlaywright;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler, sessionObject: Record<string, modelServer.Isession>) {
        this.app = app;
        this.limiter = limiter;
        this.sessionObject = sessionObject;

        this.serverName = "Microservice mcp";
        this.serverVersion = "1.0.0";

        this.toolAutomate = new ToolAutomate(this.sessionObject);
        this.toolBrowser = new ToolBrowser(this.sessionObject);
        this.toolDocument = new ToolDocument(this.sessionObject);
        this.toolMath = new ToolMath(this.sessionObject);
        this.toolOcr = new ToolOcr(this.sessionObject);
        this.toolRag = new ToolRag(this.sessionObject);
        this.toolSecurity = new ToolSecurity(this.sessionObject);
        this.toolPlaywright = new ToolPlaywright(this.sessionObject);
    }

    loginRpc = async (response: Response, mcpSessionId: string): Promise<string> => {
        const cookie = response.getHeader("set-cookie");

        if (this.sessionObject[mcpSessionId] && this.sessionObject[mcpSessionId].rpc) {
            return "ok";
        }

        if (typeof cookie === "string") {
            return instance.api
                .post<object>(
                    "/rpc",
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json, text/event-stream",
                            "mcp-session-id": mcpSessionId,
                            "mcp-cookie": cookie
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
                    }
                )
                .then(() => {
                    return "ok";
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Tool.ts - loginRpc() - catch()", error.message);

                    return "ko";
                });
        } else {
            return "ko";
        }
    };

    logoutRpc = async (request: Request): Promise<string> => {
        const mcpSessionId = request.headers["mcp-session-id"];
        const mcpCookie = request.headers["mcp-cookie"];

        if (typeof mcpSessionId === "string" && typeof mcpCookie === "string") {
            return instance.api
                .post<object>(
                    "/rpc",
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json, text/event-stream",
                            "mcp-session-id": mcpSessionId,
                            "mcp-cookie": mcpCookie
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
                    return mcpSessionId;
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Tool.ts - logoutRpc() - catch()", error.message);

                    return "ko";
                });
        }

        return "ko";
    };

    toolRegistration = (server: McpServer): void => {
        server.registerTool(this.toolAutomate.screenshot().name, this.toolAutomate.screenshot().config, this.toolAutomate.screenshot().content);
        server.registerTool(this.toolAutomate.mouseMove().name, this.toolAutomate.mouseMove().config, this.toolAutomate.mouseMove().content);
        server.registerTool(this.toolAutomate.mouseClick().name, this.toolAutomate.mouseClick().config, this.toolAutomate.mouseClick().content);
        server.registerTool(this.toolRag.store().name, this.toolRag.store().config, this.toolRag.store().content);
        server.registerTool(this.toolRag.search().name, this.toolRag.search().config, this.toolRag.search().content);
        server.registerTool(this.toolRag.delete().name, this.toolRag.delete().config, this.toolRag.delete().content);
        server.registerTool(this.toolBrowser.execute().name, this.toolBrowser.execute().config, this.toolBrowser.execute().content);
        server.registerTool(this.toolDocument.execute().name, this.toolDocument.execute().config, this.toolDocument.execute().content);
        server.registerTool(this.toolMath.execute().name, this.toolMath.execute().config, this.toolMath.execute().content);
        server.registerTool(this.toolOcr.execute().name, this.toolOcr.execute().config, this.toolOcr.execute().content);
        server.registerTool(this.toolSecurity.execute().name, this.toolSecurity.execute().config, this.toolSecurity.execute().content);
        server.registerTool(this.toolPlaywright.execute().name, this.toolPlaywright.execute().config, this.toolPlaywright.execute().content);
    };

    rpc = (): void => {
        this.app.post("/rpc", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiRpcBody;

            if (typeof mcpSessionId === "string" && body.method === "initialize") {
                const rpc = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => mcpSessionId,
                    enableJsonResponse: true
                });

                this.sessionObject[mcpSessionId] = {
                    ...this.sessionObject[mcpSessionId],
                    rpc
                };

                const server = new McpServer({
                    name: this.serverName,
                    version: this.serverVersion
                });

                this.toolRegistration(server);

                await server.connect(rpc);

                await this.sessionObject[mcpSessionId].rpc.handleRequest(request, response, body);

                return;
            } else if (
                typeof mcpSessionId === "string" &&
                this.sessionObject[mcpSessionId] &&
                this.sessionObject[mcpSessionId].rpc &&
                body.method === "terminate"
            ) {
                this.sessionObject[mcpSessionId].rpc.close();

                helperSrc.responseBody(mcpSessionId, "", response, 200);

                return;
            }

            if (typeof mcpSessionId === "string" && this.sessionObject[mcpSessionId] && this.sessionObject[mcpSessionId].rpc) {
                await this.sessionObject[mcpSessionId].rpc.handleRequest(request, response, body);
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/rpc) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/rpc", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string" && this.sessionObject[mcpSessionId] && this.sessionObject[mcpSessionId].rpc) {
                await this.sessionObject[mcpSessionId].rpc.handleRequest(request, response);
            } else {
                helperSrc.writeLog("Tool.ts - api() - get(/rpc) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };

    api = (): void => {
        this.app.get("/api/tool-list", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const resultList: modelTool.Itool[] = [
                    {
                        name: this.toolRag.search().name,
                        argumentObject: this.toolRag.inputSchemaSearch.parse({}),
                        icon: "rag.svg",
                        description: this.toolRag.search().config.description,
                        example: this.toolRag.search().config.example,
                        inputInstruction: this.toolRag.search().config.inputInstruction
                    },
                    {
                        name: this.toolOcr.execute().name,
                        argumentObject: this.toolOcr.inputSchema.parse({}),
                        icon: "ocr.svg",
                        description: this.toolOcr.execute().config.description,
                        example: this.toolOcr.execute().config.example,
                        inputInstruction: this.toolOcr.execute().config.inputInstruction
                    },
                    {
                        name: this.toolDocument.execute().name,
                        argumentObject: this.toolDocument.inputSchema.parse({}),
                        icon: "document.svg",
                        description: this.toolDocument.execute().config.description,
                        example: this.toolDocument.execute().config.example,
                        inputInstruction: this.toolDocument.execute().config.inputInstruction
                    },
                    {
                        name: this.toolSecurity.execute().name,
                        argumentObject: this.toolSecurity.inputSchema.parse({}),
                        icon: "security.svg",
                        description: this.toolSecurity.execute().config.description,
                        example: this.toolSecurity.execute().config.example,
                        inputInstruction: this.toolSecurity.execute().config.inputInstruction
                    },
                    {
                        name: this.toolPlaywright.execute().name,
                        argumentObject: this.toolPlaywright.inputSchema.parse({}),
                        icon: "playwright.svg",
                        description: this.toolPlaywright.execute().config.description,
                        example: this.toolPlaywright.execute().config.example,
                        inputInstruction: this.toolPlaywright.execute().config.inputInstruction
                    },
                    {
                        name: this.toolMath.execute().name,
                        argumentObject: this.toolMath.inputSchema.parse({}),
                        icon: "math.svg",
                        description: this.toolMath.execute().config.description,
                        example: this.toolMath.execute().config.example,
                        inputInstruction: this.toolMath.execute().config.inputInstruction
                    }
                ];

                helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
            } else {
                helperSrc.writeLog("Tool.ts - api() - get(/api/tool-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/tool-call", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const mcpCookie = request.headers["mcp-cookie"];
            const body = request.body as modelTool.IapiToolCallBody;

            if (typeof mcpSessionId === "string" && typeof mcpCookie === "string") {
                instance.api
                    .post<object>(
                        "/rpc",
                        {
                            headers: {
                                "Content-Type": "application/json",
                                Accept: "application/json, text/event-stream",
                                "mcp-session-id": mcpSessionId,
                                "mcp-cookie": mcpCookie
                            }
                        },
                        body
                    )
                    .then((resultApi) => {
                        const data = resultApi.data;

                        helperSrc.responseBody(JSON.stringify(data), "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Tool.ts - api() - post(/api/tool-call) - post(/rpc) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/tool-call) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/task-list", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const resultList: modelTool.Itask[] = [
                    {
                        name: "automate_browser",
                        argumentObject: { url: "..." },
                        icon: "automate_browser.svg",
                        description: "Interact with the browser and execute the instructions in a loop until the requests are completed.",
                        example: [""].join("\n"),
                        inputInstruction: [].join("\n")
                    }
                ];

                helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
            } else {
                helperSrc.writeLog("Tool.ts - api() - get(/api/task-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/task-call", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiTaskCallBody;

            if (typeof mcpSessionId === "string" && this.sessionObject[mcpSessionId]) {
                const runtime = this.sessionObject[mcpSessionId].runtime;

                if (runtime) {
                    let result = "[]";

                    if (Array.isArray(body.list)) {
                        for (let a = 0; a < body.list.length; a++) {
                            const tool = body.list[a];

                            if (tool.name === "browser_chrome") {
                                await runtime.browserChrome(mcpSessionId, tool.argumentObject["url"] as string);
                            }

                            /*if (tool.name === "automate_mouse_move") {
                                await runtime.automateMouseMove(mcpSessionId, parseInt(tool.argumentObject["x"]), parseInt(tool.argumentObject["y"]));
                            }
 
                            if (tool.name === "automate_mouse_click") {
                                await runtime.automateMouseClick(mcpSessionId, parseInt(tool.argumentObject["button"]));
                            }*/
                        }

                        let count = 0;

                        while (result === "[]" && count <= 2) {
                            await runtime.automateScreenshot(mcpSessionId);

                            result = await runtime.ocrExecute(mcpSessionId, "", "screenshot.jpg", "", "data");

                            await new Promise((resolve) => setTimeout(resolve, 3000));

                            const pathFile = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/screenshot.jpg`;

                            const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(pathFile);

                            if (typeof fileOrFolderDelete !== "boolean") {
                                helperSrc.writeLog("Tool.ts - api() - post(/api/task-call) - fileOrFolderDelete()", fileOrFolderDelete.toString());
                            }

                            count++;
                        }

                        if (result === "[]" && count === 3) {
                            result = "Data empty.";

                            helperSrc.writeLog("Tool.ts - api() - post(/api/task-call) - Error", result);
                        }
                    }

                    helperSrc.responseBody(result, "", response, 200);
                } else {
                    helperSrc.writeLog("Tool.ts - api() - post(/api/task-call) - Error", "Runtime problem.");

                    helperSrc.responseBody("", "ko", response, 500);
                }
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/task-call) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
