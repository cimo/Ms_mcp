import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelDocument from "../model/Document.js";
import ControllerUpload from "./Upload.js";
import ToolDocument from "../tool/Document.js";
import ToolRag from "../tool/Rag.js";

export default class Document {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private sessionObject: Record<string, modelServer.Isession>;
    private controllerUpload: ControllerUpload;

    private toolDocument: ToolDocument;
    private toolRag: ToolRag;

    // Method
    constructor(app: Express.Express, limiter: RateLimitRequestHandler, sessionObject: Record<string, modelServer.Isession>) {
        this.app = app;
        this.limiter = limiter;
        this.sessionObject = sessionObject;
        this.controllerUpload = new ControllerUpload();

        this.toolDocument = new ToolDocument(this.sessionObject);
        this.toolRag = new ToolRag(this.sessionObject);
    }

    api = (): void => {
        this.app.post("/api/document-upload", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const fileNameHeader = request.headers["filename"];

            const fileName = decodeURIComponent(typeof fileNameHeader === "string" ? fileNameHeader : "");
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

                this.controllerUpload
                    .execute(request, true, true, pathDocument)
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
                        helperSrc.writeLog("Document.ts - api() - post(/api/document-upload) - execute() - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            } else {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-upload) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/document-list", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const fileList = await helperSrc.uploadedDocumentList(mcpSessionId, ".*");

                helperSrc.responseBody(JSON.stringify(fileList), "", response, 200);
            } else {
                helperSrc.writeLog("Document.ts - api() - get(/api/document-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/document-read", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiDataReadBody;

            const fileName = body.fileName;
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

                let inputExtension = "";
                let inputFileName = "";

                if (fileDetail.category === "document") {
                    inputExtension = "pdf";
                    inputFileName = `result.${inputExtension}`;
                } else if (fileDetail.category === "image") {
                    inputExtension = fileDetail.extension;
                    inputFileName = fileDetail.fileName;
                }

                helperSrc.findInDirectoryRecursive(pathDocument, inputExtension).then((pathFileList) => {
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
                                        "Document.ts - api() - post(/api/document-read) - fileReadStream()",
                                        resultFileReadStream.toString()
                                    );

                                    helperSrc.responseBody("", "ko", response, 500);
                                }
                            });

                            break;
                        }
                    }

                    if (!isFound) {
                        helperSrc.writeLog("Document.ts - api() - post(/api/document-read) - Error", "File not found.");

                        helperSrc.responseBody("ko", "", response, 200);
                    }
                });
            } else {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/document-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiDataDeleteBody;

            const fileName = body.fileName;
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

                const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(pathDocument);

                if (typeof fileOrFolderDelete !== "boolean") {
                    helperSrc.writeLog("Document.ts - api() - post(/api/document-delete) - fileOrFolderDelete()", fileOrFolderDelete.toString());

                    helperSrc.responseBody("", "ko", response, 500);
                } else {
                    await this.toolRag.delete().content({ fileName }, { sessionId: mcpSessionId });

                    helperSrc.responseBody("ok", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
