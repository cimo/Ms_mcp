import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { FastMCP } from "fastmcp";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
//import { Cq } from "@cimo/queue/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelServer from "../model/Server.js";
import Math from "../tool/Math.js";
import Automate from "../tool/Automate.js";

export default class FastMcp {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private sessionObject: Record<string, modelServer.Isession>;

    private math: Math;
    private automate: Automate;

    private server: FastMCP;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler, sessionObject: Record<string, modelServer.Isession>) {
        this.app = app;
        this.limiter = limiter;
        this.sessionObject = sessionObject;

        this.math = new Math(this.sessionObject);
        this.automate = new Automate(this.sessionObject);

        this.server = new FastMCP({
            name: "Microservice mcp",
            version: "1.0.0",
            authenticate: async (request) => {
                const api = request.headers["x-api"];
                const sessionId = request.headers["x-mcp-session-id"] as string;

                // eslint-disable-next-line no-console
                console.log("cimo", api, sessionId);

                if (api !== "login" && sessionId && !this.sessionObject[sessionId]) {
                    throw new Error("Unauthorized");
                }

                return { sessionId };
            }
        });

        this.server.addTool(this.math.expression());
        this.server.addTool(this.automate.screenshot());
        this.server.addTool(this.automate.browserOpen());
        //server.addTool(toolAutomateMouseMove);
        //server.addTool(toolAutomateMouseClick);
        //server.addTool(toolAutomateOcr);

        const { hostname, port } = new URL(helperSrc.URL_ENGINE);

        this.server.start({
            transportType: "httpStream",
            httpStream: {
                host: hostname,
                port: port as unknown as number,
                endpoint: "/main",
                stateless: true
            }
        });
    }

    login = async (): Promise<string> => {
        return instance.api
            .post<{ sessionId: string }>(
                "/main",
                {
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/event-stream",
                        "x-api": "login"
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
                const sessionId = result.data.sessionId; //result.headers.get("mcp-session-id") as string;

                // eslint-disable-next-line no-console
                console.log("cimo", result);

                this.sessionObject[sessionId] = {
                    ...this.sessionObject[sessionId]
                };

                return sessionId;
            })
            .catch((error: Error) => {
                return error.toString();
            });
    };

    logout = async (request: Request): Promise<string> => {
        const sessionId = request.headers["x-mcp-session-id"] as string;

        return instance.api
            .delete(
                "/main",
                {
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/event-stream",
                        "mcp-session-id": sessionId,
                        "x-api": "logout",
                        "x-mcp-session-id": sessionId
                    }
                },
                {}
            )
            .then(() => {
                return sessionId;
            })
            .catch((error: Error) => {
                return error.toString();
            });
    };

    api = (): void => {
        this.app.post("/api/tool-call", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const sessionId = request.headers["x-mcp-session-id"] as string;

            if (sessionId) {
                instance.api
                    .post<string>(
                        "/main",
                        {
                            headers: {
                                "Content-Type": "application/json",
                                Accept: "application/json, text/event-stream",
                                "x-api": "tool-call",
                                "x-mcp-session-id": sessionId
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
            }
        });
    };
}
