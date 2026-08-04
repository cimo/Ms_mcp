import Fs from "fs";
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
    private checkField = (folderName: string): string => {
        let result = "";

        if (!/^[A-Za-z0-9_]+$/.test(folderName)) {
            result = "Folder name: Can only contain uppercase, lowercase, number and underscore.";
        }

        return result;
    };

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
            const fileNameEncode = request.headers["filenameencode"];
            const folderJoin = request.headers["folderjoin"];

            let pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

            const fileNameDecode = decodeURIComponent(typeof fileNameEncode === "string" ? fileNameEncode : "");
            const fileDetail = helperSrc.fileDetail(fileNameDecode);

            if (typeof mcpSessionId === "string") {
                if (folderJoin) {
                    pathDocument = `${pathDocument}${folderJoin}/`;
                }

                this.controllerUpload
                    .execute(request, true, true, pathDocument)
                    .then(async (resultControllerUploadList) => {
                        if (resultControllerUploadList.length > 0) {
                            if (fileDetail.category === "document") {
                                await this.toolDocument
                                    .execute()
                                    .content({ fileName: fileDetail.fileName, searchInput: "" }, { sessionId: mcpSessionId });
                            }

                            helperSrc.responseBody(
                                JSON.stringify({ message: "Success", isComplete: true, pathFile: `${folderJoin}/${fileDetail.fileName}` }),
                                "",
                                response,
                                200
                            );
                        } else {
                            helperSrc.responseBody(
                                JSON.stringify({ message: "Failed", isComplete: false, pathFile: `${folderJoin}/${fileDetail.fileName}` }),
                                "",
                                response,
                                200
                            );
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

        this.app.post("/api/document-list", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiListBody;

            const folderJoin = body.folderJoin;

            if (typeof mcpSessionId === "string") {
                const pathList = await helperSrc.uploadedDocumentRead(mcpSessionId, "*", folderJoin);

                helperSrc.responseBody(JSON.stringify(pathList), "", response, 200);
            } else {
                helperSrc.writeLog("Document.ts - api() - get(/api/document-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/document-read", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiReadBody;

            const fileName = body.fileName;
            const fileDetail = helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId === "string") {
                const pathDirname = await helperSrc.findPathDirnameRecursive(
                    `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`,
                    fileDetail.fileName
                );

                let inputExtension = "";
                let inputFileName = "";

                if (fileDetail.category === "document") {
                    if (fileDetail.extension === "pdf") {
                        inputExtension = fileDetail.extension;
                        inputFileName = fileDetail.fileName;
                    } else {
                        inputExtension = "pdf";
                        inputFileName = `converted.${inputExtension}`;
                    }
                } else if (fileDetail.category === "image") {
                    inputExtension = fileDetail.extension;
                    inputFileName = fileDetail.fileName;
                }

                helperSrc.findPathFileRecursive(pathDirname, inputExtension).then((pathFileList) => {
                    let isFound = false;

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith(inputFileName)) {
                            isFound = true;

                            helperSrc.fileReadStream(pathFile).then((resultFileReadStream) => {
                                if (Buffer.isBuffer(resultFileReadStream)) {
                                    helperSrc.responseBody(resultFileReadStream.toString("base64"), "", response, 200);
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
            const body = request.body as modelDocument.IapiDeleteBody;

            const pathFile = body.pathFile;

            if (typeof mcpSessionId === "string") {
                const fileDetail = helperSrc.fileDetail(pathFile);

                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

                const pathCurrent = fileDetail.baseName
                    ? await helperSrc.findPathDirnameRecursive(pathDocument, fileDetail.fileName)
                    : `${pathDocument}${pathFile}`;

                let pathFileList: string[] = [];

                if (!fileDetail.baseName) {
                    pathFileList = await helperSrc.readAllLevelPathFileRecursive(pathCurrent);
                }

                const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(pathCurrent);

                if (typeof fileOrFolderDelete !== "boolean") {
                    helperSrc.writeLog("Document.ts - api() - post(/api/document-delete) - fileOrFolderDelete()", fileOrFolderDelete.toString());

                    helperSrc.responseBody("", "ko", response, 500);
                } else {
                    if (fileDetail.baseName) {
                        await this.toolRag.delete().content({ fileName: fileDetail.fileName }, { sessionId: mcpSessionId });
                    } else {
                        for (const pathFile of pathFileList) {
                            const fileDetail = helperSrc.fileDetail(pathFile);

                            await this.toolRag.delete().content({ fileName: fileDetail.fileName }, { sessionId: mcpSessionId });
                        }
                    }

                    helperSrc.responseBody("ok", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/document-folder-create", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiFolderCreateBody;

            const folderName = body.folderName;
            const folderJoin = body.folderJoin;

            if (typeof mcpSessionId === "string") {
                const checkMessage = this.checkField(folderName);

                if (checkMessage === "") {
                    let pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

                    if (folderJoin) {
                        pathDocument = `${pathDocument}${folderJoin}/`;
                    }

                    Fs.mkdir(`${pathDocument}${folderName}/`, { recursive: true }, (error) => {
                        if (error) {
                            helperSrc.responseBody(JSON.stringify({ message: "Failed to create folder.", isComplete: false }), "", response, 200);

                            return;
                        }

                        helperSrc.responseBody(JSON.stringify({ message: "Folder created successfully.", isComplete: true }), "", response, 200);
                    });
                } else {
                    helperSrc.responseBody(JSON.stringify({ message: checkMessage, isComplete: false }), "", response, 200);
                }
            } else {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-folder-create) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
