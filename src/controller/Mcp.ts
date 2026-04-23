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

    login = async (request: Request, response: Response): Promise<string> => {
        const sessionId = request.headers["mcp-session-id"];

        if (typeof sessionId === "string" && this.sessionObject[sessionId] && this.sessionObject[sessionId].rpc) {
            return sessionId;
        }

        const cookie = response.getHeader("set-cookie");

        if (typeof cookie === "string") {
            return instance.api
                .post(
                    "/rpc",
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json, text/event-stream",
                            "mcp-session-id": typeof sessionId === "string" ? sessionId : "",
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
                    }
                )
                .then((result) => {
                    return result.headers.get("mcp-session-id") || "";
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

    toolRegistration = (server: McpServer): void => {
        server.registerTool(this.toolAutomate.screenshot().name, this.toolAutomate.screenshot().config, this.toolAutomate.screenshot().content);
        server.registerTool(this.toolAutomate.mouseMove().name, this.toolAutomate.mouseMove().config, this.toolAutomate.mouseMove().content);
        server.registerTool(this.toolAutomate.mouseClick().name, this.toolAutomate.mouseClick().config, this.toolAutomate.mouseClick().content);
        server.registerTool(this.toolBrowser.chrome().name, this.toolBrowser.chrome().config, this.toolBrowser.chrome().content);
        server.registerTool(this.toolDocument.parse().name, this.toolDocument.parse().config, this.toolDocument.parse().content);
        server.registerTool(this.toolMath.expression().name, this.toolMath.expression().config, this.toolMath.expression().content);
        server.registerTool(this.toolOcr.execute().name, this.toolOcr.execute().config, this.toolOcr.execute().content);
        server.registerTool(this.toolRag.store().name, this.toolRag.store().config, this.toolRag.store().content);
        server.registerTool(this.toolRag.search().name, this.toolRag.search().config, this.toolRag.search().content);
        server.registerTool(this.toolRag.delete().name, this.toolRag.delete().config, this.toolRag.delete().content);
    };

    rpc = (): void => {
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

                this.toolRegistration(server);

                await server.connect(rpc);

                await this.sessionObject[sessionIdNew].rpc.handleRequest(request, response, request.body);

                return;
            } else if (typeof sessionId === "string" && request.body.method === "terminate") {
                this.sessionObject[sessionId].rpc.close();

                this.toolRag.delete().content({ fileName: "" }, { sessionId });

                helperSrc.responseBody(sessionId, "", response, 200);

                return;
            }

            if (typeof sessionId === "string") {
                await this.sessionObject[sessionId].rpc.handleRequest(request, response, request.body);
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/rpc) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/rpc", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId === "string" && this.sessionObject[sessionId] && this.sessionObject[sessionId].rpc) {
                await this.sessionObject[sessionId].rpc.handleRequest(request, response);
            } else {
                helperSrc.writeLog("Mcp.ts - api() - get(/rpc) - Error", "Missing or invalid header.");

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

                        this.toolDocument
                            .parse()
                            .content({ fileName }, { sessionId })
                            .then(() => {
                                this.toolRag
                                    .store()
                                    .content({ fileName }, { sessionId })
                                    .then(() => {
                                        const baseFileName = helperSrc.baseFileName(fileName);
                                        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${baseFileName}/`;

                                        helperSrc.fileWriteStream(`${input}.done`, Buffer.from(""), () => {});
                                    });
                            });

                        helperSrc.responseBody(fileName, "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Mcp.ts - api() - post(/api/upload) - controllerUpload - execute() - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/upload) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/embedding-check", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];
            const baseFileName = helperSrc.baseFileName(request.body.fileName);

            if (typeof sessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${baseFileName}/`;

                helperSrc.findFileInDirectoryRecursive(input, ".done", (pathFileList) => {
                    let embeddingFinished = false;

                    for (const pathFile of pathFileList) {
                        if (pathFile.endsWith(".done")) {
                            embeddingFinished = true;

                            break;
                        }
                    }

                    helperSrc.responseBody(embeddingFinished.toString(), "", response, 200);
                });
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/embedding-check) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/file-uploaded", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId === "string") {
                helperSrc.uploadedFileList(sessionId, ".*").then((fileList) => {
                    helperSrc.responseBody(JSON.stringify(fileList), "", response, 200);
                });
            } else {
                helperSrc.writeLog("Mcp.ts - api() - get(/api/file-uploaded) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/file-uploaded-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];
            const fileName = request.body.fileName;
            const baseFileName = helperSrc.baseFileName(fileName);

            if (typeof sessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${baseFileName}/`;

                helperSrc.fileOrFolderDelete(input, (result) => {
                    if (typeof result !== "boolean") {
                        helperSrc.writeLog("Mcp.ts - api() - post(/api/file-uploaded-delete) - fileOrFolderDelete()", result.toString());

                        helperSrc.responseBody("", result.toString(), response, 500);
                    }
                });

                this.toolRag.delete().content({ fileName }, { sessionId });

                helperSrc.responseBody("ok", "", response, 200);
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/file-uploaded-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/file-read", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];
            const baseFileName = helperSrc.baseFileName(request.body.fileName);
            const pageNumber = request.body.pageNumber;

            if (typeof sessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${baseFileName}/page/`;

                helperSrc.findFileInDirectoryRecursive(input, ".html", (pathFileList) => {
                    for (const pathFile of pathFileList) {
                        if (pathFile.endsWith(`${pageNumber}.html`)) {
                            helperSrc.fileReadStream(pathFile, (resultFileReadStream) => {
                                if (Buffer.isBuffer(resultFileReadStream)) {
                                    const readResult = {
                                        fileContent: resultFileReadStream.toString("base64"),
                                        pageTotal: pathFileList.length
                                    };

                                    helperSrc.responseBody(JSON.stringify(readResult), "", response, 200);
                                } else {
                                    helperSrc.writeLog("Mcp.ts - api() - post(/api/file-read) - fileReadStream()", resultFileReadStream.toString());

                                    helperSrc.responseBody("", resultFileReadStream.toString(), response, 500);
                                }
                            });

                            break;
                        }
                    }
                });
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/file-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/tool-list", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId === "string") {
                const resultList: modelMcp.Itool[] = [
                    {
                        name: this.toolDocument.parse().name,
                        argumentObject: this.toolDocument.inputSchemaParse.parse({}),
                        icon: "document.png",
                        description: this.toolDocument.parse().config.description
                    },
                    {
                        name: this.toolMath.expression().name,
                        argumentObject: this.toolMath.inputSchema.parse({}),
                        icon: "math.png",
                        description: this.toolMath.expression().config.description
                    },
                    {
                        name: this.toolOcr.execute().name,
                        argumentObject: this.toolOcr.inputSchema.parse({}),
                        icon: "ocr.png",
                        description: this.toolOcr.execute().config.description
                    },
                    {
                        name: this.toolRag.search().name,
                        argumentObject: this.toolRag.inputSchemaSearch.parse({}),
                        icon: "rag.png",
                        description: this.toolRag.search().config.description
                    }
                ];

                helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
            } else {
                helperSrc.writeLog("Mcp.ts - api() - get(/api/tool-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
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
                        helperSrc.responseBody(result.data, "", response, 200);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-call) - post(/rpc) - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/tool-call) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/task-list", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];

            if (typeof sessionId === "string") {
                const resultList: modelMcp.Itool[] = [
                    {
                        name: "automate_browser",
                        argumentObject: { url: "..." },
                        icon: "automate_browser.png",
                        description: "Interact with the browser and execute the instructions in a loop until the requests are completed."
                    }
                ];

                helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
            } else {
                helperSrc.writeLog("Mcp.ts - api() - get(/api/tool-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/task-call", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const sessionId = request.headers["mcp-session-id"];
            const body = request.body as modelMcp.ItaskCall;

            if (typeof sessionId === "string") {
                const runtime = this.sessionObject[sessionId].runtime;

                if (runtime) {
                    let result = "[]";

                    if (typeof request.body === "object") {
                        for (const tool of body.list) {
                            if (tool.name === "automate_browser") {
                                await runtime.chrome(sessionId, tool.argumentObject["url"]);
                            }

                            /*if (tool.name === "automate_mouse_move") {
                                await runtime.automateMouseMove(sessionId, parseInt(tool.argumentObject["x"]), parseInt(tool.argumentObject["y"]));
                            }

                            if (tool.name === "automate_mouse_click") {
                                await runtime.automateMouseClick(sessionId, parseInt(tool.argumentObject["button"]));
                            }*/
                        }

                        let count = 0;

                        while (result === "[]" && count <= 2) {
                            await runtime.automateScreenshot(sessionId);

                            result = await runtime.ocrExecute(sessionId, "", "screenshot.jpg", "", "data");

                            await new Promise((resolve) => setTimeout(resolve, 3000));

                            const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/screenshot.jpg`;

                            helperSrc.fileOrFolderDelete(input, (resultFileDelete) => {
                                if (typeof resultFileDelete !== "boolean") {
                                    helperSrc.writeLog("Mcp.ts - api() - post(/api/task-call) - fileOrFolderDelete()", resultFileDelete.toString());

                                    helperSrc.responseBody("", resultFileDelete.toString(), response, 500);
                                }
                            });

                            count++;
                        }

                        if (result === "[]" && count === 3) {
                            result = "Data empty.";

                            helperSrc.writeLog("Mcp.ts - api() - post(/api/task-call) - Error", result);
                        }
                    }

                    helperSrc.responseBody(result, "", response, 200);
                } else {
                    helperSrc.writeLog("Mcp.ts - api() - post(/api/task-call) - Error", "Runtime problem.");

                    helperSrc.responseBody("", "ko", response, 500);
                }
            } else {
                helperSrc.writeLog("Mcp.ts - api() - post(/api/task-call) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
