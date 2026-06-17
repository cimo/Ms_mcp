import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import AdmZip from "adm-zip";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelServer from "../model/Server.js";
import * as modelTool from "../model/Tool.js";
import ControllerUpload from "./Upload.js";
import ControllerAgent from "./Agent.js";
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
    private controllerUpload: ControllerUpload;
    private controllerAgent: ControllerAgent;

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
        this.controllerUpload = new ControllerUpload();
        this.controllerAgent = new ControllerAgent();

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

    login = async (request: Request, response: Response): Promise<string> => {
        const mcpSessionId = request.headers["mcp-session-id"];
        const cookie = response.getHeader("set-cookie");

        if (typeof mcpSessionId === "string" && this.sessionObject[mcpSessionId] && this.sessionObject[mcpSessionId].rpc) {
            this.controllerAgent.tableCreate(mcpSessionId);

            return mcpSessionId;
        }

        if (typeof mcpSessionId === "string" && typeof cookie === "string") {
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
                .then((resultApi) => {
                    const mcpSessionId = resultApi.headers.get("mcp-session-id");

                    if (mcpSessionId) {
                        this.controllerAgent.tableCreate(mcpSessionId);
                    }

                    return mcpSessionId || "";
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Tool.ts - login() - catch()", error.message);

                    return "ko";
                });
        } else {
            return "ko";
        }
    };

    logout = async (request: Request): Promise<string> => {
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
                    helperSrc.writeLog("Tool.ts - logout() - catch()", error.message);

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
            let body = request.body as modelTool.IapiRpcBody;

            if (body.method === "initialize") {
                const mcpSessionIdNew = helperSrc.generateUniqueId();

                const rpc = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => mcpSessionIdNew,
                    enableJsonResponse: true
                });

                this.sessionObject[mcpSessionIdNew] = {
                    ...this.sessionObject[mcpSessionIdNew],
                    rpc
                };

                const server = new McpServer({
                    name: this.serverName,
                    version: this.serverVersion
                });

                this.toolRegistration(server);

                await server.connect(rpc);

                await this.sessionObject[mcpSessionIdNew].rpc.handleRequest(request, response, body);

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
        this.app.post("/api/document-upload", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const fileNameHeader = request.headers["filename"];

            const fileName = decodeURIComponent(typeof fileNameHeader === "string" ? fileNameHeader : "");
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

                this.controllerUpload
                    .execute(request, true, true, input)
                    .then(async (resultControllerUploadList) => {
                        if (resultControllerUploadList.length > 0) {
                            if (fileDetail.category === "document") {
                                await this.toolDocument
                                    .execute()
                                    .content({ fileName: fileDetail.fileName, searchInput: "" }, { sessionId: mcpSessionId });
                            }

                            helperSrc.responseBody(JSON.stringify({ fileName: fileDetail.fileName, status: "Success" }), "", response, 200);
                        } else {
                            helperSrc.responseBody(JSON.stringify({ fileName: fileDetail.fileName, status: "Failed" }), "", response, 200);
                        }
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Tool.ts - api() - post(/api/document-upload) - execute() - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/document-upload) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/document-list", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const fileList = await helperSrc.uploadedDocumentList(mcpSessionId, ".*");

                helperSrc.responseBody(JSON.stringify(fileList), "", response, 200);
            } else {
                helperSrc.writeLog("Tool.ts - api() - get(/api/document-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/document-read", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiDocumentReadBody;

            const pageNumber = body.pageNumber;
            const fileName = body.fileName;
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                let input = "";
                let inputExtension = "";
                let inputFileName = "";

                if (fileDetail.category === "document") {
                    input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/page/`;
                    inputExtension = "html";
                    inputFileName = `${pageNumber}.${inputExtension}`;
                } else if (fileDetail.category === "image") {
                    input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;
                    inputExtension = fileDetail.extension;
                    inputFileName = fileDetail.fileName;
                }

                helperSrc.findInDirectoryRecursive(input, inputExtension).then((pathFileList) => {
                    let isFound = false;

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith(inputFileName)) {
                            isFound = true;

                            helperSrc.fileReadStream(pathFile).then((resultFileReadStream) => {
                                if (Buffer.isBuffer(resultFileReadStream)) {
                                    const readObject = {
                                        fileContent: resultFileReadStream.toString("base64"),
                                        pageTotal: pathFileList.length
                                    };

                                    helperSrc.responseBody(JSON.stringify(readObject), "", response, 200);
                                } else {
                                    helperSrc.writeLog(
                                        "Tool.ts - api() - post(/api/document-read) - fileReadStream()",
                                        resultFileReadStream.toString()
                                    );

                                    helperSrc.responseBody("", "ko", response, 500);
                                }
                            });

                            break;
                        }
                    }

                    if (!isFound) {
                        helperSrc.writeLog("Tool.ts - api() - post(/api/document-read) - Error", "File not found.");

                        helperSrc.responseBody("ko", "", response, 200);
                    }
                });
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/document-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/document-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiDocumentDeleteBody;

            const fileName = body.fileName;
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

                const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(input);

                if (typeof fileOrFolderDelete !== "boolean") {
                    helperSrc.writeLog("Tool.ts - api() - post(/api/document-delete) - fileOrFolderDelete()", fileOrFolderDelete.toString());

                    helperSrc.responseBody("", "ko", response, 500);
                } else {
                    await this.toolRag.delete().content({ fileName }, { sessionId: mcpSessionId });

                    helperSrc.responseBody("ok", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/document-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/rag-embedding-start", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const fileList = await helperSrc.uploadedDocumentList(mcpSessionId, ".*");

                const fileNameList = [];

                for (const file of fileList) {
                    const fileDetail = helperSrc.fileDetail(file.fileName);

                    if (fileDetail.category === "document") {
                        fileNameList.push(fileDetail.fileName);

                        this.toolRag.store().content({ fileName: fileDetail.fileName }, { sessionId: mcpSessionId });
                    }
                }

                helperSrc.responseBody(JSON.stringify(fileNameList), "", response, 200);
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/rag-embedding-start) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/rag-embedding-check", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiRagEmbeddingCheckBody;

            const fileName = body.fileName;
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

                helperSrc.findInDirectoryRecursive(input, ".*").then((pathFileList) => {
                    let status = "Ongoing";

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith(".done")) {
                            status = "Success";

                            break;
                        } else if (pathFile.endsWith(".fail")) {
                            status = "Failed";

                            break;
                        }
                    }

                    helperSrc.responseBody(status, "", response, 200);
                });
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/rag-embedding-check) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/skill-upload", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const fileNameHeader = request.headers["filename"];

            const fileName = decodeURIComponent(typeof fileNameHeader === "string" ? fileNameHeader : "");
            const fileDetail = helperSrc.fileDetail(fileName);

            if (fileDetail.extension === "zip" && !/^[a-z0-9_.]+$/.test(fileDetail.baseName)) {
                helperSrc.responseBody(JSON.stringify({ fileName: fileDetail.fileName, status: "Failed" }), "", response, 200);

                return;
            }

            if (typeof mcpSessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/`;

                this.controllerUpload
                    .execute(request, true, true, input)
                    .then((resultControllerUploadList) => {
                        if (resultControllerUploadList.length > 0) {
                            const zip = new AdmZip(`${input}${fileDetail.baseName}/${fileDetail.fileName}`);
                            const entryList = zip.getEntries();

                            let isSkillMd = false;
                            let isAssetFolder = false;
                            let isScriptFolder = false;

                            for (let a = 0; a < entryList.length; a++) {
                                const entry = entryList[a];

                                if (entry.entryName === "skill.md") {
                                    isSkillMd = true;
                                } else if (entry.entryName === "asset/") {
                                    isAssetFolder = true;
                                } else if (entry.entryName === "script/") {
                                    isScriptFolder = true;
                                }
                            }

                            if (isSkillMd && isAssetFolder && isScriptFolder) {
                                zip.extractAllTo(`${input}${fileDetail.baseName}`, true);
                            }

                            helperSrc.responseBody(JSON.stringify({ fileName: fileDetail.fileName, status: "Success" }), "", response, 200);
                        } else {
                            helperSrc.responseBody(JSON.stringify({ fileName: fileDetail.fileName, status: "Failed" }), "", response, 200);
                        }
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Tool.ts - api() - post(/api/skill-upload) - execute() - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/skill-upload) - Error", `${response}`);

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/skill-list", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const fileList = await helperSrc.uploadedSkillList(mcpSessionId, ".*");

                helperSrc.responseBody(JSON.stringify(fileList), "", response, 200);
            } else {
                helperSrc.writeLog("Tool.ts - api() - get(/api/skill-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/skill-read", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiSkillReadBody;

            const fileName = body.fileName;

            if (typeof mcpSessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/${fileName}/`;

                helperSrc.findInDirectoryRecursive(input, ".md").then((pathFileList) => {
                    let isFound = false;

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith("skill.md")) {
                            isFound = true;

                            helperSrc.fileReadStream(pathFile).then((resultFileReadStream) => {
                                if (Buffer.isBuffer(resultFileReadStream)) {
                                    helperSrc.responseBody(resultFileReadStream.toString("base64"), "", response, 200);
                                } else {
                                    helperSrc.writeLog("Tool.ts - api() - post(/api/skill-read) - fileReadStream()", resultFileReadStream.toString());

                                    helperSrc.responseBody("", "ko", response, 500);
                                }
                            });

                            break;
                        }
                    }

                    if (!isFound) {
                        helperSrc.writeLog("Tool.ts - api() - post(/api/skill-read) - Error", "File not found.");

                        helperSrc.responseBody("ko", "", response, 200);
                    }
                });
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/skill-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/skill-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiSkillDeleteBody;

            const fileName = body.fileName;

            if (typeof mcpSessionId === "string") {
                const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/${fileName}/`;

                const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(input);

                if (typeof fileOrFolderDelete !== "boolean") {
                    helperSrc.writeLog("Tool.ts - api() - post(/api/skill-delete) - fileOrFolderDelete()", fileOrFolderDelete.toString());

                    helperSrc.responseBody("", "ko", response, 500);
                } else {
                    helperSrc.responseBody("ok", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/skill-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/tool-list", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const resultList: modelTool.Itool[] = [
                    {
                        name: this.toolDocument.execute().name,
                        argumentObject: this.toolDocument.inputSchema.parse({}),
                        icon: "document.svg",
                        description: this.toolDocument.execute().config.description,
                        example: this.toolDocument.execute().config.example,
                        inputInstruction: this.toolDocument.execute().config.inputInstruction
                    },
                    {
                        name: this.toolMath.execute().name,
                        argumentObject: this.toolMath.inputSchema.parse({}),
                        icon: "math.svg",
                        description: this.toolMath.execute().config.description,
                        example: this.toolMath.execute().config.example,
                        inputInstruction: this.toolMath.execute().config.inputInstruction
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
                        name: this.toolSecurity.execute().name,
                        argumentObject: this.toolSecurity.inputSchema.parse({}),
                        icon: "security.svg",
                        description: this.toolSecurity.execute().config.description,
                        example: this.toolSecurity.execute().config.example,
                        inputInstruction: this.toolSecurity.execute().config.inputInstruction
                    },
                    {
                        name: this.toolRag.search().name,
                        argumentObject: this.toolRag.inputSchemaSearch.parse({}),
                        icon: "rag.svg",
                        description: this.toolRag.search().config.description,
                        example: this.toolRag.search().config.example,
                        inputInstruction: this.toolRag.search().config.inputInstruction
                    },
                    {
                        name: this.toolPlaywright.execute().name,
                        argumentObject: this.toolPlaywright.inputSchema.parse({}),
                        icon: "playwright.svg",
                        description: this.toolPlaywright.execute().config.description,
                        example: this.toolPlaywright.execute().config.example,
                        inputInstruction: this.toolPlaywright.execute().config.inputInstruction
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

                            const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/screenshot.jpg`;

                            const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(input);

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

        this.app.post("/api/agent-create", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiAgentCreateBody;

            const name = body.name;
            const description = body.description;
            const skillName = body.skillName;

            if (typeof mcpSessionId === "string") {
                const isInsert = this.controllerAgent.tableInsert(mcpSessionId, name, description, skillName);

                if (isInsert) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("", "ko", response, 500);
                }
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/agent-create) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/agent-update", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiAgentUpdateBody;

            const id = body.id;
            const name = body.name;
            const description = body.description;
            const skillName = body.skillName;

            if (typeof mcpSessionId === "string") {
                const isUpdate = this.controllerAgent.tableUpdate(mcpSessionId, id, name, description, skillName);

                if (isUpdate) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("ko", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/agent-update) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/agent-list", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const resultList = this.controllerAgent.tableSelectList(mcpSessionId);

                helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
            } else {
                helperSrc.writeLog("Tool.ts - api() - get(/api/agent-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/agent-delete", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelTool.IapiAgentDeleteBody;

            const id = body.id;

            if (typeof mcpSessionId === "string") {
                const isDelete = this.controllerAgent.tableDelete(mcpSessionId, id);

                if (isDelete) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("ko", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Tool.ts - api() - post(/api/agent-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
