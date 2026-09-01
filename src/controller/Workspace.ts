import Fs from "fs";
import Path from "path";
import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelWorkspace from "../model/Workspace.js";
import ControllerUpload from "./Upload.js";
import ToolDocument from "../tool/Document.js";
import ToolRag from "../tool/Rag.js";

export default class Workspace {
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
        this.app.post("/api/workspace-upload", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const fileNameEncode = request.headers["filenameencode"];
            const folderJoin = request.headers["folderjoin"];

            let pathWorkspace = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`;

            const fileNameDecode = decodeURIComponent(typeof fileNameEncode === "string" ? fileNameEncode : "");
            const fileDetail = await helperSrc.fileDetail(fileNameDecode);

            const pathFile = folderJoin ? `${folderJoin}/${fileDetail.name}` : fileDetail.name;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-upload) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header.", data: pathFile }, response, 500);
            } else {
                if (folderJoin) {
                    pathWorkspace = `${pathWorkspace}${folderJoin}/`;
                }

                this.controllerUpload
                    .execute(request, true, true, pathWorkspace)
                    .then(async (resultControllerUploadList) => {
                        if (resultControllerUploadList.length === 0) {
                            helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-upload) - execute() - then()", "Failed to upload.");

                            helperSrc.responseBody({ state: "ko", message: "Failed to upload.", data: pathFile }, response, 500);
                        } else {
                            if (fileDetail.category === "document") {
                                await this.toolDocument
                                    .execute()
                                    .content({ fileName: fileDetail.name, searchInput: "" }, { sessionId: mcpSessionId });
                            }

                            helperSrc.responseBody({ state: "ok", message: "", data: pathFile }, response, 200);
                        }
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-upload) - execute() - catch()", error.message);

                        helperSrc.responseBody({ state: "ko", message: "Failed to upload.", data: pathFile }, response, 500);
                    });
            }
        });

        this.app.post("/api/workspace-retrieve", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelWorkspace.IapiBody;

            const folderJoin = body.folderJoin;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-retrieve) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                const detailList = await helperSrc.retrieveWorkspaceItem(mcpSessionId, "*", folderJoin);

                helperSrc.responseBody({ state: "ok", message: "", data: detailList }, response, 200);
            }
        });

        this.app.post("/api/workspace-read", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelWorkspace.IapiReadBody;

            const fileName = body.fileName;
            const fileDetail = await helperSrc.fileDetail(fileName);

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                const pathDirname = await helperSrc.findPathDirnameRecursive(
                    `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`,
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

                helperSrc.fileReadStream(`${pathDirname}/${inputFileName}`).then((resultFileReadStream) => {
                    if (!Buffer.isBuffer(resultFileReadStream)) {
                        helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-read) - fileReadStream()", resultFileReadStream.toString());

                        helperSrc.responseBody({ state: "ko", message: "Failed to read." }, response, 500);
                    } else {
                        helperSrc.responseBody({ state: "ok", message: "", data: resultFileReadStream.toString("base64") }, response, 200);
                    }
                });
            }
        });

        this.app.post("/api/workspace-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelWorkspace.IapiDeleteBody;

            const pathList = body.pathList;

            const pathWorkspace = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                const pathListSlice = pathList.slice();

                for (const path of pathListSlice) {
                    const itemDetail = await helperSrc.fileDetail(path);

                    if (!itemDetail.baseName) {
                        for (let a = pathList.length - 1; a >= 0; a--) {
                            if (pathList[a] !== path && pathList[a].startsWith(path)) {
                                pathList.splice(a, 1);
                            }
                        }
                    }
                }

                for (const path of pathList) {
                    const itemDetail = await helperSrc.fileDetail(path);

                    const pathCurrent = itemDetail.baseName ? `${pathWorkspace}${Path.dirname(path)}/` : `${pathWorkspace}${path}`;

                    let pathFileList: string[] = [];

                    if (!itemDetail.baseName) {
                        pathFileList = await helperSrc.readAllLevelPathFileRecursive(pathCurrent);
                    }

                    const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(pathCurrent);

                    if (typeof fileOrFolderDelete !== "boolean") {
                        helperSrc.writeLog(
                            "Workspace.ts - api() - post(/api/workspace-delete) - fileOrFolderDelete()",
                            fileOrFolderDelete.toString()
                        );

                        helperSrc.responseBody({ state: "ko", message: "Failed to delete." }, response, 500);

                        return;
                    } else {
                        if (itemDetail.baseName) {
                            if ((await helperSrc.findPathDirnameRecursive(pathWorkspace, itemDetail.name)) === "") {
                                await this.toolRag.delete().content({ fileName: itemDetail.name }, { sessionId: mcpSessionId });
                            }
                        } else {
                            for (const pathFile of pathFileList) {
                                const fileDetail = await helperSrc.fileDetail(pathFile);

                                if ((await helperSrc.findPathDirnameRecursive(pathWorkspace, fileDetail.name)) === "") {
                                    await this.toolRag.delete().content({ fileName: fileDetail.name }, { sessionId: mcpSessionId });
                                }
                            }
                        }
                    }
                }

                helperSrc.responseBody({ state: "ok", message: "" }, response, 200);
            }
        });

        this.app.post("/api/workspace-rename", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelWorkspace.IapiRenameBody;

            const pathItem = body.pathItem;
            const name = body.name;

            const pathWorkspace = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-rename) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                const fileDetailOld = await helperSrc.fileDetail(pathItem);
                const nameOld = fileDetailOld.baseName ? fileDetailOld.baseName : Path.basename(pathItem);

                let pathNew = "";

                if (fileDetailOld.baseName) {
                    pathNew = Path.join(Path.dirname(Path.dirname(pathItem)), name, `${name}.${fileDetailOld.extension}`);
                } else {
                    pathNew = Path.join(Path.dirname(pathItem), name);
                }

                if (name === "" || nameOld === name) {
                    helperSrc.responseBody({ state: "ok", message: "" }, response, 200);

                    return;
                }

                const errorMessageList = this.checkField(name);

                if (await helperSrc.fileOrFolderExists(`${pathWorkspace}${pathNew}`)) {
                    errorMessageList.push("Name already exists.");
                }

                if (errorMessageList.length > 0) {
                    helperSrc.responseBody({ state: "ko", message: errorMessageList }, response, 200);
                } else {
                    let fileOrFolderRename: boolean | NodeJS.ErrnoException = false;

                    if (fileDetailOld.baseName) {
                        fileOrFolderRename = await helperSrc.fileOrFolderRename(
                            `${pathWorkspace}${Path.dirname(pathItem)}/`,
                            `${pathWorkspace}${Path.dirname(pathNew)}/`,
                            fileDetailOld.name,
                            `${name}.${fileDetailOld.extension}`
                        );
                    } else {
                        fileOrFolderRename = await helperSrc.fileOrFolderRename(`${pathWorkspace}${pathItem}`, `${pathWorkspace}${pathNew}`);
                    }

                    if (typeof fileOrFolderRename !== "boolean") {
                        helperSrc.writeLog(
                            "Workspace.ts - api() - post(/api/workspace-rename) - fileOrFolderRename()",
                            fileOrFolderRename.toString()
                        );

                        helperSrc.responseBody({ state: "ko", message: "Failed to rename." }, response, 500);
                    } else {
                        helperSrc.responseBody({ state: "ok", message: "" }, response, 200);
                    }
                }
            }
        });

        this.app.post("/api/workspace-folder-create", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelWorkspace.IapiFolderCreateBody;

            const folderName = body.folderName;
            const folderJoin = body.folderJoin;

            let pathWorkspace = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`;

            if (folderJoin) {
                pathWorkspace = `${pathWorkspace}${folderJoin}/`;
            }

            const pathTarget = `${pathWorkspace}${folderName}/`;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-folder-create) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                if (folderName === "") {
                    helperSrc.responseBody({ state: "ok", message: "" }, response, 200);

                    return;
                }

                const errorMessageList = this.checkField(folderName);

                if (await helperSrc.fileOrFolderExists(pathTarget)) {
                    errorMessageList.push("Name already exists.");
                }

                if (errorMessageList.length > 0) {
                    helperSrc.responseBody({ state: "ko", message: errorMessageList }, response, 200);
                } else {
                    Fs.mkdir(pathTarget, { recursive: false }, (error) => {
                        if (error) {
                            helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-folder-create) - Fs.mkdir()", error.toString());

                            helperSrc.responseBody({ state: "ko", message: "Failed to create." }, response, 500);

                            return;
                        }

                        helperSrc.responseBody({ state: "ok", message: "" }, response, 200);
                    });
                }
            }
        });

        this.app.post("/api/workspace-folder-move", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelWorkspace.IapiFolderMoveBody;

            const pathList = body.pathList;
            const folderJoin = body.folderJoin ? `${body.folderJoin}/` : "";

            const pathWorkspace = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Workspace.ts - api() - post(/api/workspace-folder-move) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                const errorMessageList: string[] = [];

                const targetFolder = Path.normalize(body.folderJoin || ".");

                const pathListSlice = pathList.slice();

                for (const path of pathListSlice) {
                    const itemDetail = await helperSrc.fileDetail(path);

                    const pathNormalize = Path.normalize(path.replace(/\/+$/, ""));

                    const parentFolder = Path.dirname(itemDetail.baseName ? Path.dirname(pathNormalize) : pathNormalize);

                    const pathFolder = itemDetail.baseName ? `${Path.dirname(path)}/` : `${path}`;

                    if (parentFolder === targetFolder) {
                        errorMessageList.push("Failed to move.");

                        break;
                    } else if (await helperSrc.fileOrFolderExists(`${pathWorkspace}${folderJoin}${Path.basename(pathFolder)}/`)) {
                        errorMessageList.push("Failed to move.");

                        break;
                    } else if (!itemDetail.baseName) {
                        const pathRelative = Path.relative(path, folderJoin);

                        if (pathRelative === "" || (pathRelative !== ".." && !pathRelative.startsWith(`../`))) {
                            errorMessageList.push("Failed to move.");

                            break;
                        }

                        for (let a = pathList.length - 1; a >= 0; a--) {
                            if (pathList[a] !== path && pathList[a].startsWith(path)) {
                                pathList.splice(a, 1);
                            }
                        }
                    }
                }

                if (errorMessageList.length > 0) {
                    helperSrc.responseBody({ state: "ko", message: errorMessageList }, response, 200);
                } else {
                    for (const path of pathList) {
                        const itemDetail = await helperSrc.fileDetail(path);

                        const pathCurrent = itemDetail.baseName ? `${pathWorkspace}${Path.dirname(path)}/` : `${pathWorkspace}${path}`;

                        const fileOrFolderMove = await helperSrc.fileOrFolderMove(
                            pathCurrent,
                            `${pathWorkspace}${folderJoin}${Path.basename(pathCurrent)}/`
                        );

                        if (typeof fileOrFolderMove !== "boolean") {
                            helperSrc.writeLog(
                                "Workspace.ts - api() - post(/api/workspace-folder-move) - fileOrFolderMove()",
                                fileOrFolderMove.toString()
                            );

                            helperSrc.responseBody({ state: "ko", message: "Failed to move." }, response, 500);

                            return;
                        }
                    }

                    helperSrc.responseBody({ state: "ok", message: "" }, response, 200);
                }
            }
        });
    };
}
