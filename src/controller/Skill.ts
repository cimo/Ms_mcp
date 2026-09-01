import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import AdmZip from "adm-zip";

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
        this.app.post("/api/skill-upload", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const fileNameEncode = request.headers["filenameencode"];

            const pathSkill = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/`;

            const fileNameDecode = decodeURIComponent(typeof fileNameEncode === "string" ? fileNameEncode : "");
            const fileDetail = await helperSrc.fileDetail(fileNameDecode);

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header.", data: fileDetail.name }, response, 500);
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
                        .then((resultControllerUploadList) => {
                            if (resultControllerUploadList.length === 0) {
                                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - execute() - then()", "Failed to upload.");

                                helperSrc.responseBody({ state: "ko", message: "Failed to upload.", data: fileDetail.name }, response, 500);
                            } else {
                                const zip = new AdmZip(`${pathSkill}${fileDetail.baseName}/${fileDetail.name}`);
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

                                if (!isSkillMd || !isAssetFolder || !isScriptFolder) {
                                    helperSrc.fileOrFolderDelete(`${pathSkill}${fileDetail.baseName}`);

                                    helperSrc.responseBody(
                                        { state: "ko", message: "Invalid file and folder structure.", data: fileDetail.name },
                                        response,
                                        200
                                    );
                                } else {
                                    zip.extractAllTo(`${pathSkill}${fileDetail.baseName}`, true);

                                    helperSrc.responseBody({ state: "ok", message: "", data: fileDetail.name }, response, 200);
                                }
                            }
                        })
                        .catch((error: Error) => {
                            helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - execute() - catch()", error.message);

                            helperSrc.responseBody({ state: "ko", message: "Failed to upload.", data: fileDetail.name }, response, 500);
                        });
                }
            }
        });

        this.app.get("/api/skill-retrieve", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - get(/api/skill-retrieve) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                const detailList = await helperSrc.retrieveSkill(mcpSessionId, "*");

                helperSrc.responseBody({ state: "ok", message: "", data: detailList }, response, 200);
            }
        });

        this.app.post("/api/skill-read", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelSkill.IapiReadBody;

            const fileName = body.fileName;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
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
        });

        this.app.post("/api/skill-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelSkill.IapiDeleteBody;

            const fileNameList = body.fileNameList;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
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
        });
    };
}
