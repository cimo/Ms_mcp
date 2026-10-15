import Fs from "fs";
import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { unzip, UnzipFileInfo } from "fflate";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelSkill from "../model/Skill.js";
import ControllerUpload from "./Upload.js";

export default class Skill {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private controllerUpload: ControllerUpload;

    // Method
    private checkField = (name: string): string[] => {
        const resultList: string[] = [];

        if (!/^[A-Za-z0-9_]+$/.test(name)) {
            resultList.push("Name: Can only contain uppercase, lowercase, number and underscore.");
        }

        return resultList;
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;
        this.controllerUpload = new ControllerUpload();
    }

    api = (): void => {
        this.app.post(
            "/api/skill-upload",
            this.limiter,
            Ca.authenticationMiddleware,
            Ca.identityMiddleware("mcp-session-id"),
            async (request: Request, response: Response) => {
                const mcpSessionId = request.headers["mcp-session-id"];
                const fileNameEncode = request.headers["filenameencode"];

                const pathSkill = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/`;

                const fileNameDecode =
                    typeof fileNameEncode === "string" && helperSrc.checkUriComponent(fileNameEncode) ? decodeURIComponent(fileNameEncode) : "";
                const fileDetail = await helperSrc.fileDetail(fileNameDecode);

                if (typeof mcpSessionId !== "string") {
                    helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - Error", "Missing or invalid header.");

                    helperSrc.responseBody({ state: "ko", message: "Missing or invalid header.", data: fileDetail.name }, response, 500);
                } else if (fileNameDecode === "") {
                    helperSrc.responseBody({ state: "ko", message: "Invalid file name.", data: fileDetail.name }, response, 200);
                } else {
                    const errorMessageList = this.checkField(fileDetail.baseName);

                    if (fileDetail.extension !== "zip") {
                        errorMessageList.push("Only zip file is allowed.");
                    }

                    if (errorMessageList.length > 0) {
                        helperSrc.responseBody({ state: "ko", message: errorMessageList, data: fileDetail.name }, response, 200);
                    } else {
                        this.controllerUpload
                            .execute(request, true, true, pathSkill)
                            .then((resultControllerUpload) => {
                                if (resultControllerUpload.message !== "") {
                                    helperSrc.responseBody(
                                        { state: "ko", message: resultControllerUpload.message, data: fileDetail.name },
                                        response,
                                        200
                                    );
                                } else {
                                    Fs.readFile(`${pathSkill}${fileDetail.baseName}/${fileDetail.name}`, (errorReadFile, buffer) => {
                                        if (errorReadFile) {
                                            helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - readFile()", errorReadFile.message);

                                            helperSrc.responseBody(
                                                { state: "ko", message: "Failed to upload.", data: fileDetail.name },
                                                response,
                                                500
                                            );

                                            return;
                                        }

                                        let unzipSize = 0;
                                        let isUnzipSizeExceeded = false;

                                        const unzipFilter = (file: UnzipFileInfo): boolean => {
                                            unzipSize += file.originalSize;

                                            if (!helperSrc.fileCheckSize(unzipSize)) {
                                                isUnzipSizeExceeded = true;
                                            }

                                            return !isUnzipSizeExceeded;
                                        };

                                        unzip(buffer, { filter: unzipFilter }, (error: Error | null, zip: Record<string, Uint8Array>) => {
                                            if (error) {
                                                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - unzip()", error.message);

                                                helperSrc.responseBody(
                                                    { state: "ko", message: "Failed to upload.", data: fileDetail.name },
                                                    response,
                                                    500
                                                );

                                                return;
                                            }

                                            if (isUnzipSizeExceeded) {
                                                helperSrc.fileOrFolderDelete(`${pathSkill}${fileDetail.baseName}`);

                                                helperSrc.responseBody(
                                                    { state: "ko", message: "Unzipped size exceeds limit.", data: fileDetail.name },
                                                    response,
                                                    200
                                                );

                                                return;
                                            }

                                            const entryList = Object.keys(zip);

                                            let isPathValid = true;
                                            let isSkillMd = false;
                                            let isAssetFolder = false;
                                            let isScriptFolder = false;

                                            for (let a = 0; a < entryList.length; a++) {
                                                const entry = entryList[a];

                                                if (!helperSrc.checkPathChild(`${pathSkill}${fileDetail.baseName}/`, entry)) {
                                                    isPathValid = false;
                                                }

                                                if (entry === "skill.md") {
                                                    isSkillMd = true;
                                                } else if (entry === "asset/") {
                                                    isAssetFolder = true;
                                                } else if (entry === "script/") {
                                                    isScriptFolder = true;
                                                }
                                            }

                                            if (!isPathValid) {
                                                helperSrc.fileOrFolderDelete(`${pathSkill}${fileDetail.baseName}`);

                                                helperSrc.responseBody(
                                                    { state: "ko", message: "Invalid path.", data: fileDetail.name },
                                                    response,
                                                    200
                                                );
                                            } else if (!isSkillMd || !isAssetFolder || !isScriptFolder) {
                                                helperSrc.fileOrFolderDelete(`${pathSkill}${fileDetail.baseName}`);

                                                helperSrc.responseBody(
                                                    { state: "ko", message: "Invalid file and folder structure.", data: fileDetail.name },
                                                    response,
                                                    200
                                                );
                                            } else {
                                                const next = (a: number): void => {
                                                    if (a >= entryList.length) {
                                                        helperSrc.responseBody({ state: "ok", message: "", data: fileDetail.name }, response, 200);

                                                        return;
                                                    }

                                                    const entry = entryList[a];
                                                    const pathEntry = `${pathSkill}${fileDetail.baseName}/${entry}`;

                                                    if (entry.endsWith("/")) {
                                                        Fs.mkdir(pathEntry, { recursive: true }, () => next(a + 1));
                                                    } else {
                                                        Fs.mkdir(
                                                            pathEntry.substring(0, pathEntry.lastIndexOf("/")),
                                                            { recursive: true },
                                                            (errorMkdir) => {
                                                                if (errorMkdir) {
                                                                    helperSrc.writeLog(
                                                                        "Skill.ts - api() - post(/api/skill-upload) - mkdir()",
                                                                        errorMkdir.message
                                                                    );

                                                                    helperSrc.responseBody(
                                                                        { state: "ko", message: "Failed to upload.", data: fileDetail.name },
                                                                        response,
                                                                        500
                                                                    );

                                                                    return;
                                                                }

                                                                Fs.writeFile(pathEntry, zip[entry], (errorWriteFile) => {
                                                                    if (errorWriteFile) {
                                                                        helperSrc.writeLog(
                                                                            "Skill.ts - api() - post(/api/skill-upload) - writeFile()",
                                                                            errorWriteFile.message
                                                                        );

                                                                        helperSrc.responseBody(
                                                                            { state: "ko", message: "Failed to upload.", data: fileDetail.name },
                                                                            response,
                                                                            500
                                                                        );

                                                                        return;
                                                                    }

                                                                    next(a + 1);
                                                                });
                                                            }
                                                        );
                                                    }
                                                };

                                                next(0);
                                            }
                                        });
                                    });
                                }
                            })
                            .catch((error: Error) => {
                                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - execute() - catch()", error.message);

                                helperSrc.responseBody({ state: "ko", message: "Failed to upload.", data: fileDetail.name }, response, 500);
                            });
                    }
                }
            }
        );

        this.app.get(
            "/api/skill-retrieve",
            Ca.authenticationMiddleware,
            Ca.identityMiddleware("mcp-session-id"),
            async (request: Request, response: Response) => {
                const mcpSessionId = request.headers["mcp-session-id"];

                if (typeof mcpSessionId !== "string") {
                    helperSrc.writeLog("Skill.ts - api() - get(/api/skill-retrieve) - Error", "Missing or invalid header.");

                    helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
                } else {
                    const detailList = await helperSrc.retrieveSkill(mcpSessionId, "*");

                    helperSrc.responseBody({ state: "ok", message: "", data: detailList }, response, 200);
                }
            }
        );

        this.app.post(
            "/api/skill-read",
            this.limiter,
            Ca.authenticationMiddleware,
            Ca.identityMiddleware("mcp-session-id"),
            (request: Request, response: Response) => {
                const mcpSessionId = request.headers["mcp-session-id"];
                const body = request.body as modelSkill.IapiReadBody;

                const fileName = body.fileName;

                if (typeof mcpSessionId !== "string") {
                    helperSrc.writeLog("Skill.ts - api() - post(/api/skill-read) - Error", "Missing or invalid header.");

                    helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
                } else if (!helperSrc.checkPathChild(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/`, fileName)) {
                    helperSrc.responseBody({ state: "ko", message: "Invalid path." }, response, 200);
                } else {
                    const pathSkill = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/${fileName}/skill.md`;

                    helperSrc.fileReadStream(pathSkill).then((resultFileReadStream) => {
                        if (!Buffer.isBuffer(resultFileReadStream)) {
                            helperSrc.writeLog("Skill.ts - api() - post(/api/skill-read) - fileReadStream()", resultFileReadStream.toString());

                            helperSrc.responseBody({ state: "ko", message: "Failed to read." }, response, 500);
                        } else {
                            helperSrc.responseBody({ state: "ok", message: "", data: resultFileReadStream.toString("base64") }, response, 200);
                        }
                    });
                }
            }
        );

        this.app.post(
            "/api/skill-delete",
            this.limiter,
            Ca.authenticationMiddleware,
            Ca.identityMiddleware("mcp-session-id"),
            async (request: Request, response: Response) => {
                const mcpSessionId = request.headers["mcp-session-id"];
                const body = request.body as modelSkill.IapiDeleteBody;

                const fileNameList = body.fileNameList;

                if (typeof mcpSessionId !== "string") {
                    helperSrc.writeLog("Skill.ts - api() - post(/api/skill-delete) - Error", "Missing or invalid header.");

                    helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
                } else {
                    for (let a = 0; a < fileNameList.length; a++) {
                        if (!helperSrc.checkPathChild(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/`, fileNameList[a])) {
                            helperSrc.responseBody({ state: "ko", message: "Invalid path." }, response, 200);

                            return;
                        }
                    }

                    for (const fileName of fileNameList) {
                        const pathSkill = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/${fileName}/`;

                        const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(pathSkill);

                        if (typeof fileOrFolderDelete !== "boolean") {
                            helperSrc.writeLog("Skill.ts - api() - post(/api/skill-delete) - fileOrFolderDelete()", fileOrFolderDelete.toString());

                            helperSrc.responseBody({ state: "ko", message: "Failed to delete." }, response, 500);

                            return;
                        }
                    }

                    helperSrc.responseBody({ state: "ok", message: "" }, response, 200);
                }
            }
        );
    };
}
