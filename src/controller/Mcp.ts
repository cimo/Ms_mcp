import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
//import { Cq } from "@cimo/queue/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelServer from "../model/Server.js";
import ToolMath from "../tool/Math.js";
//import Automate from "../tool/Automate.js";

export default class Mcp {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private sessionObject: Record<string, modelServer.Isession>;

    private serverName: string;
    private serverVersion: string;

    private toolMath: ToolMath;
    //private automate: Automate;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler, sessionObject: Record<string, modelServer.Isession>) {
        this.app = app;
        this.limiter = limiter;
        this.sessionObject = sessionObject;

        this.serverName = "Microservice mcp";
        this.serverVersion = "1.0.0";

        this.toolMath = new ToolMath(this.sessionObject);
        //this.automate = new Automate(this.sessionObject);
    }

    login = async (response: Response): Promise<string> => {
        const cookie = response.getHeader("set-cookie") as string;

        return instance.api
            .post(
                "/rcp",
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
                const sessionId = result.headers.get("mcp-session-id") as string;

                return sessionId;
            })
            .catch((error: Error) => {
                return error.toString();
            });
    };

    logout = async (request: Request): Promise<string> => {
        const cookie = request.headers["cookie"] as string;
        const sessionId = request.headers["mcp-session-id"] as string;

        return instance.api
            .post(
                "/rcp",
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
                return error.toString();
            });
    };

    toolRegistartion = (server: McpServer): void => {
        server.registerTool(this.toolMath.read().name, this.toolMath.read().config, this.toolMath.read().content);
        //this.server.addTool(this.automate.screenshot());
        //this.server.addTool(this.automate.browserOpen());
        //server.addTool(toolAutomateMouseMove);
        //server.addTool(toolAutomateMouseClick);
        //server.addTool(toolAutomateOcr);
    };

    api = (): void => {
        this.app.post("/rcp", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"] as string;

            if (!sessionId && request.body.method === "initialize") {
                const sessionIdNew = helperSrc.generateUniqueId();

                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => sessionIdNew,
                    enableJsonResponse: true
                });

                this.sessionObject[sessionIdNew] = {
                    ...this.sessionObject[sessionIdNew],
                    transport
                };

                const server = new McpServer({
                    name: this.serverName,
                    version: this.serverVersion
                });

                this.toolRegistartion(server);

                await server.connect(transport);

                await this.sessionObject[sessionIdNew].transport.handleRequest(request, response, request.body);

                return;
            } else if (sessionId && request.body.method === "terminate") {
                this.sessionObject[sessionId].transport.close();

                helperSrc.responseBody(sessionId, "", response, 200);

                return;
            }

            await this.sessionObject[sessionId].transport.handleRequest(request, response, request.body);
        });

        this.app.post("/api/tool-call", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const cookie = request.headers["cookie"] as string;
            const sessionId = request.headers["mcp-session-id"] as string;

            if (cookie && sessionId) {
                instance.api
                    .post<string>(
                        "/rcp",
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
                    .catch(() => {
                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
