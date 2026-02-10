import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { FastMCP } from "fastmcp";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
//import { Cu } from "@cimo/queue/dist/src/Main.js";

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

        this.math = new Math();
        this.automate = new Automate(this.sessionObject);

        this.server = new FastMCP<Record<string, unknown>>({
            name: "Microservice mcp",
            version: "1.0.0"
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
                stateless: false
            }
        });
    }

    login = (): Promise<string> => {
        return instance.api
            .post(
                "/main",
                {
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/event-stream"
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
                const sessionId = result.headers.get("mcp-session-id") || "";

                this.sessionObject[sessionId] = {
                    ...this.sessionObject[sessionId]
                };

                return sessionId;
            })
            .catch((error: Error) => {
                return error.toString();
            });
    };

    logout = (request: Request): Promise<string> => {
        const sessionId = request.headers["mcp-session-id"] as string;

        return instance.api
            .delete(
                "/main",
                {
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/event-stream",
                        "mcp-session-id": sessionId
                    }
                },
                {}
            )
            .then(() => {
                return "ok";
            })
            .catch((error: Error) => {
                return error.toString();
            });
    };

    api = (): void => {
        this.app.post("/api/tool-call", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"] as string;

            if (sessionId) {
                // eslint-disable-next-line no-console
                console.log("cimo1", sessionId);

                instance.api
                    .post<string>(
                        "/main",
                        {
                            headers: {
                                "Content-Type": "application/json",
                                Accept: "application/json, text/event-stream",
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
            }
        });
    };
}
