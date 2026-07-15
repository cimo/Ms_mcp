import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelRag from "../model/Rag.js";
import ToolRag from "../tool/Rag.js";

export default class Rag {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private sessionObject: Record<string, modelServer.Isession>;

    private toolRag: ToolRag;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler, sessionObject: Record<string, modelServer.Isession>) {
        this.app = app;
        this.limiter = limiter;
        this.sessionObject = sessionObject;

        this.toolRag = new ToolRag(this.sessionObject);
    }

    api = (): void => {
        this.app.post("/api/rag-start", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const fileList = await helperSrc.uploadedDocumentRead(mcpSessionId, ".*");

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
                helperSrc.writeLog("Rag.ts - api() - post(/api/rag-start) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/rag-check", Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelRag.IapiDataCheckBody;

            const fileName = body.fileName;
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

                helperSrc.findInDirectoryRecursive(pathDocument, ".*").then((pathFileList) => {
                    let status = "Ongoing";

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith(".rag_done")) {
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
                helperSrc.writeLog("Rag.ts - api() - post(/api/rag-check) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/rag-graph", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const pathFile = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/rag_graph.html`;

                helperSrc.fileReadStream(pathFile).then((resultFileReadStream) => {
                    if (Buffer.isBuffer(resultFileReadStream)) {
                        helperSrc.responseBody(resultFileReadStream.toString("utf-8"), "", response, 200);
                    } else {
                        helperSrc.responseBody("ko", "", response, 200);
                    }
                });
            } else {
                helperSrc.writeLog("Rag.ts - api() - get(/api/rag-graph) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
