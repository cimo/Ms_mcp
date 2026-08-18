import Path from "path";
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

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Rag.ts - api() - post(/api/rag-start) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const pathFileList = await helperSrc.readAllLevelPathFileRecursive(
                    `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`
                );

                const documentList: string[] = [];

                for (const pathFile of pathFileList) {
                    const fileDetail = helperSrc.fileDetail(pathFile);

                    if (fileDetail.category === "document") {
                        documentList.push(pathFile);

                        this.toolRag.store().content({ pathFile }, { sessionId: mcpSessionId });
                    }
                }

                if (pathFileList.length === 0) {
                    helperSrc.responseBody(JSON.stringify({ state: "ko", message: "No documents found for RAG." }), "", response, 200);
                } else {
                    helperSrc.responseBody(JSON.stringify({ state: "ok", message: "", data: documentList }), "", response, 200);
                }
            }
        });

        this.app.post("/api/rag-check", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelRag.IapiCheckBody;

            const pathFile = body.pathFile;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Rag.ts - api() - post(/api/rag-check) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const fileDetail = helperSrc.fileDetail(pathFile);

                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

                const pathCurrent = fileDetail.baseName ? `${pathDocument}${Path.dirname(pathFile)}/` : `${pathDocument}${pathFile}`;

                helperSrc.findPathFileRecursive(pathCurrent, "*").then((pathFileList) => {
                    let state = "ongoing";

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith(".rag_done")) {
                            state = "success";

                            break;
                        } else if (pathFile.endsWith(".fail")) {
                            state = "failed";

                            break;
                        }
                    }

                    helperSrc.responseBody(JSON.stringify({ state, message: "" }), "", response, 200);
                });
            }
        });

        this.app.get("/api/rag-graph", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Rag.ts - api() - get(/api/rag-graph) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const pathFile = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/rag_graph.html`;

                helperSrc.fileReadStream(pathFile).then((resultFileReadStream) => {
                    if (!Buffer.isBuffer(resultFileReadStream)) {
                        helperSrc.writeLog("Rag.ts - api() - get(/api/rag-graph) - fileReadStream()", resultFileReadStream.toString());

                        helperSrc.responseBody("", "ko", response, 500);
                    } else {
                        helperSrc.responseBody(
                            JSON.stringify({ state: "ok", message: "", data: resultFileReadStream.toString("utf-8") }),
                            "",
                            response,
                            200
                        );
                    }
                });
            }
        });
    };
}
