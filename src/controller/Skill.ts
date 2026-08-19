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

            if (fileDetail.extension === "zip" && !/^[A-Za-z0-9_]+$/.test(fileDetail.baseName)) {
                helperSrc.responseBody(JSON.stringify({ state: "ko", message: "", data: `/${fileDetail.name}` }), "", response, 200);

                return;
            }

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - Error", `${response}`);

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                this.controllerUpload
                    .execute(request, true, true, pathSkill)
                    .then((resultControllerUploadList) => {
                        if (resultControllerUploadList.length === 0) {
                            helperSrc.responseBody(JSON.stringify({ state: "ko", message: "", data: `/${fileDetail.name}` }), "", response, 200);
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

                            if (isSkillMd && isAssetFolder && isScriptFolder) {
                                zip.extractAllTo(`${pathSkill}${fileDetail.baseName}`, true);
                            }

                            helperSrc.responseBody(JSON.stringify({ state: "ok", message: "", data: `/${fileDetail.name}` }), "", response, 200);
                        }
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Skill.ts - api() - post(/api/skill-upload) - execute() - catch()", error.message);

                        helperSrc.responseBody("", "ko", response, 500);
                    });
            }
        });

        this.app.get("/api/skill-list", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - get(/api/skill-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const fileDetailList = await helperSrc.uploadedSkillRead(mcpSessionId, "*");

                helperSrc.responseBody(JSON.stringify({ state: "ok", message: "", data: fileDetailList }), "", response, 200);
            }
        });

        this.app.post("/api/skill-read", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelSkill.IapiReadBody;

            const fileName = body.fileName;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-read) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const pathSkill = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/${fileName}/`;

                helperSrc.findPathFileRecursive(pathSkill, "md").then((pathFileList) => {
                    let isFound = false;

                    for (let a = 0; a < pathFileList.length; a++) {
                        const pathFile = pathFileList[a];

                        if (pathFile.endsWith("skill.md")) {
                            isFound = true;

                            helperSrc.fileReadStream(pathFile).then((resultFileReadStream) => {
                                if (!Buffer.isBuffer(resultFileReadStream)) {
                                    helperSrc.writeLog(
                                        "Skill.ts - api() - post(/api/skill-read) - fileReadStream()",
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
                        helperSrc.writeLog("Skill.ts - api() - post(/api/skill-read) - Error", "File not found.");

                        helperSrc.responseBody("", "ko", response, 500);
                    }
                });
            }
        });

        this.app.post("/api/skill-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelSkill.IapiDeleteBody;

            const fileName = body.fileName;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Skill.ts - api() - post(/api/skill-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const pathSkill = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/skill/${fileName}/`;

                const fileOrFolderDelete = await helperSrc.fileOrFolderDelete(pathSkill);

                if (typeof fileOrFolderDelete !== "boolean") {
                    helperSrc.writeLog("Skill.ts - api() - post(/api/skill-delete) - fileOrFolderDelete()", fileOrFolderDelete.toString());

                    helperSrc.responseBody("", "ko", response, 500);
                } else {
                    helperSrc.responseBody("ok", "", response, 200);
                }
            }
        });
    };
}
