import Fs from "fs";
import Path from "path";
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
    private checkField = (name: string): string[] => {
        const resultList: string[] = [];

        if (!/^[A-Za-z0-9_]+$/.test(name)) {
            resultList.push("Name: Can only contain uppercase, lowercase, number and underscore.");
        }

        return resultList;
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
        this.app.post("/api/document-upload", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const fileNameEncode = request.headers["filenameencode"];
            const folderJoin = request.headers["folderjoin"];

            let pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

            const fileNameDecode = decodeURIComponent(typeof fileNameEncode === "string" ? fileNameEncode : "");
            const fileDetail = await helperSrc.fileDetail(fileNameDecode);

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-upload) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                if (folderJoin) {
                    pathDocument = `${pathDocument}${folderJoin}/`;
                }

                this.controllerUpload
                    .execute(request, true, true, pathDocument)
                    .then(async (resultControllerUploadList) => {
                        if (resultControllerUploadList.length === 0) {
                            helperSrc.responseBody(
                                JSON.stringify({ state: "ko", message: "", data: `${folderJoin}/${fileDetail.name}` }),
                                "",
                                response,
                                200
                            );
                        } else {
                            if (fileDetail.category === "document") {
                                await this.toolDocument
                                    .execute()
                                    .content({ fileName: fileDetail.name, searchInput: "" }, { sessionId: mcpSessionId });
                            }

                            helperSrc.responseBody(
                                JSON.stringify({ state: "ok", message: "", data: `${folderJoin}/${fileDetail.name}` }),
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
            }
        });

        this.app.post("/api/document-list", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiListBody;

            const folderJoin = body.folderJoin;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Document.ts - api() - get(/api/document-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const fileDetailList = await helperSrc.uploadedDocumentRead(mcpSessionId, "*", folderJoin);

                helperSrc.responseBody(JSON.stringify({ state: "ok", message: "", data: fileDetailList }), "", response, 200);
            }
        });

        this.app.post("/api/document-read", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiReadBody;

            const fileName = body.fileName;
            const fileDetail = await helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const pathDirname = await helperSrc.findPathDirnameRecursive(
                    `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`,
                    fileDetail.name
                );

                let inputExtension = "";
                let inputFileName = "";

                if (fileDetail.category === "document") {
                    if (fileDetail.extension === "pdf") {
                        inputExtension = fileDetail.extension;
                        inputFileName = fileDetail.name;
                    } else {
                        inputExtension = "pdf";
                        inputFileName = `converted.${inputExtension}`;
                    }
                } else if (fileDetail.category === "image") {
                    inputExtension = fileDetail.extension;
                    inputFileName = fileDetail.name;
                }

                helperSrc.findPathFileRecursive(pathDirname, inputExtension).then((pathFileList) => {
                    let isFound = false;

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith(inputFileName)) {
                            isFound = true;

                            helperSrc.fileReadStream(pathFile).then((resultFileReadStream) => {
                                if (!Buffer.isBuffer(resultFileReadStream)) {
                                    helperSrc.writeLog(
                                        "Document.ts - api() - post(/api/document-read) - fileReadStream()",
                                        resultFileReadStream.toString()
                                    );

                                    helperSrc.responseBody("", "ko", response, 500);
                                } else {
                                    helperSrc.responseBody(
                                        JSON.stringify({ state: "ok", message: "", data: resultFileReadStream.toString("base64") }),
                                        "",
                                        response,
                                        200
                                    );
                                }
                            });

                            break;
                        }
                    }

                    if (!isFound) {
                        helperSrc.writeLog("Document.ts - api() - post(/api/document-read) - Error", "File not found.");

                        helperSrc.responseBody("", "ko", response, 500);
                    }
                });
            }
        });

        this.app.post("/api/document-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiDeleteBody;

            const pathItem = body.pathItem;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const fileDetail = await helperSrc.fileDetail(pathItem);

                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

                const pathCurrent = fileDetail.baseName ? `${pathDocument}${Path.dirname(pathItem)}/` : `${pathDocument}${pathItem}`;

                let pathFileList: string[] = [];

                if (!fileDetail.baseName) {
                    pathFileList = await helperSrc.readAllLevelPathFileRecursive(pathCurrent);
                }

                if (Fs.existsSync(pathCurrent)) {
                    const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(pathCurrent);

                    if (typeof fileOrFolderDelete !== "boolean") {
                        helperSrc.writeLog("Document.ts - api() - post(/api/document-delete) - fileOrFolderDelete()", fileOrFolderDelete.toString());

                        helperSrc.responseBody("", "ko", response, 500);
                    } else {
                        if (fileDetail.baseName) {
                            if ((await helperSrc.findPathDirnameRecursive(pathDocument, fileDetail.name)) === "") {
                                await this.toolRag.delete().content({ fileName: fileDetail.name }, { sessionId: mcpSessionId });
                            }
                        } else {
                            for (const pathFile of pathFileList) {
                                const fileDetail = await helperSrc.fileDetail(pathFile);

                                if ((await helperSrc.findPathDirnameRecursive(pathDocument, fileDetail.name)) === "") {
                                    await this.toolRag.delete().content({ fileName: fileDetail.name }, { sessionId: mcpSessionId });
                                }
                            }
                        }

                        helperSrc.responseBody("ok", "", response, 200);
                    }
                } else {
                    helperSrc.responseBody("ok", "", response, 200);
                }
            }
        });

        this.app.post("/api/document-rename", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiRenameBody;

            const pathItem = body.pathItem;
            const name = body.name;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-rename) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const fileDetailOld = await helperSrc.fileDetail(pathItem);
                const nameOld = fileDetailOld.baseName ? fileDetailOld.baseName : Path.basename(pathItem);

                const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

                let pathNew = "";

                if (fileDetailOld.baseName) {
                    pathNew = Path.join(Path.dirname(Path.dirname(pathItem)), name, `${name}.${fileDetailOld.extension}`);
                } else {
                    pathNew = Path.join(Path.dirname(pathItem), name);
                }

                if (name === "" || nameOld === name) {
                    helperSrc.responseBody(JSON.stringify({ state: "ok", message: "" }), "", response, 200);

                    return;
                }

                const checkMessageList = this.checkField(name);

                if (Fs.existsSync(`${pathDocument}${pathNew}`)) {
                    checkMessageList.push("Name already exists.");
                }

                if (checkMessageList.length > 0) {
                    helperSrc.responseBody(JSON.stringify({ state: "ko", message: checkMessageList }), "", response, 200);
                } else {
                    let fileOrFolderRename: boolean | NodeJS.ErrnoException = false;

                    if (fileDetailOld.baseName) {
                        fileOrFolderRename = await helperSrc.fileOrFolderRename(
                            `${pathDocument}${Path.dirname(pathItem)}/`,
                            `${pathDocument}${Path.dirname(pathNew)}/`,
                            fileDetailOld.name,
                            `${name}.${fileDetailOld.extension}`
                        );
                    } else {
                        fileOrFolderRename = await helperSrc.fileOrFolderRename(`${pathDocument}${pathItem}`, `${pathDocument}${pathNew}`);
                    }

                    if (typeof fileOrFolderRename !== "boolean") {
                        helperSrc.writeLog("Document.ts - api() - post(/api/document-rename) - fileOrFolderRename()", fileOrFolderRename.toString());

                        helperSrc.responseBody("", "ko", response, 500);
                    } else {
                        helperSrc.responseBody(JSON.stringify({ state: "ok", message: "" }), "", response, 200);
                    }
                }
            }
        });

        this.app.post("/api/document-folder-create", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiFolderCreateBody;

            const folderName = body.folderName;
            const folderJoin = body.folderJoin;

            let pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

            if (folderJoin) {
                pathDocument = `${pathDocument}${folderJoin}/`;
            }

            const pathTarget = `${pathDocument}${folderName}/`;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-folder-create) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                if (folderName === "") {
                    helperSrc.responseBody(JSON.stringify({ state: "ok", message: "" }), "", response, 200);

                    return;
                }

                const checkMessageList = this.checkField(folderName);

                if (Fs.existsSync(pathTarget)) {
                    checkMessageList.push("Name already exists.");
                }

                if (checkMessageList.length > 0) {
                    helperSrc.responseBody(JSON.stringify({ state: "ko", message: checkMessageList }), "", response, 200);
                } else {
                    Fs.mkdir(pathTarget, { recursive: false }, (error) => {
                        if (error) {
                            helperSrc.writeLog("Document.ts - api() - post(/api/document-folder-create) - Fs.mkdir()", error.toString());

                            helperSrc.responseBody("", "ko", response, 500);

                            return;
                        }

                        helperSrc.responseBody(JSON.stringify({ state: "ok", message: "" }), "", response, 200);
                    });
                }
            }
        });

        this.app.post("/api/document-folder-move", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelDocument.IapiFolderMoveBody;

            const pathList = body.pathList;
            const folderJoin = body.folderJoin ? `${body.folderJoin}/` : "";

            const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/`;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Document.ts - api() - post(/api/document-folder-move) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                let isError = false;

                const targetFolder = Path.normalize(body.folderJoin || ".");

                const pathListSlice = pathList.slice();

                for (const path of pathListSlice) {
                    const fileDetail = await helperSrc.fileDetail(path);

                    const pathNormalize = Path.normalize(path.replace(/\/+$/, ""));

                    const parentFolder = Path.dirname(fileDetail.baseName ? Path.dirname(pathNormalize) : pathNormalize);

                    const pathFolder = fileDetail.baseName ? `${Path.dirname(path)}/` : `${path}`;

                    if (parentFolder === targetFolder) {
                        isError = true;

                        break;
                    } else if (Fs.existsSync(`${pathDocument}${folderJoin}${Path.basename(pathFolder)}/`)) {
                        isError = true;

                        break;
                    } else if (!fileDetail.baseName) {
                        const pathRelative = Path.relative(path, folderJoin);

                        if (pathRelative === "" || (pathRelative !== ".." && !pathRelative.startsWith(`../`))) {
                            isError = true;

                            break;
                        }

                        for (let a = pathList.length - 1; a >= 0; a--) {
                            if (pathList[a] !== path && pathList[a].startsWith(path)) {
                                pathList.splice(a, 1);
                            }
                        }
                    }
                }

                if (isError) {
                    helperSrc.responseBody(JSON.stringify({ state: "ko", message: "Failed to move." }), "", response, 200);
                } else {
                    let fileOrFolderMove: boolean | NodeJS.ErrnoException = false;

                    for (const path of pathList) {
                        const fileDetail = await helperSrc.fileDetail(path);

                        const pathCurrent = fileDetail.baseName ? `${pathDocument}${Path.dirname(path)}/` : `${pathDocument}${path}`;

                        fileOrFolderMove = await helperSrc.fileOrFolderMove(
                            pathCurrent,
                            `${pathDocument}${folderJoin}${Path.basename(pathCurrent)}/`
                        );

                        if (typeof fileOrFolderMove !== "boolean") {
                            break;
                        }
                    }

                    if (typeof fileOrFolderMove !== "boolean") {
                        helperSrc.writeLog("Document.ts - api() - post(/api/document-folder-move) - fileOrFolderMove()", fileOrFolderMove.toString());

                        helperSrc.responseBody("", "ko", response, 500);
                    } else {
                        helperSrc.responseBody(JSON.stringify({ state: "ok", message: "" }), "", response, 200);
                    }
                }
            }
        });
    };
}
