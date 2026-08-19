import { Request } from "express";
import Fs from "fs";
import { Cfdp, CfdpModel } from "@cimo/form-data_parser/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";

export default class Upload {
    // Variable

    // Method
    private checkRequest = async (formDataList: CfdpModel.Iinput[]): Promise<string> => {
        let result = "";

        const parameterList: string[] = [];

        for (let a = 0; a < formDataList.length; a++) {
            const formData = formDataList[a];

            parameterList.push(formData.name);

            if (formData.name === "file") {
                const fileDetail = await helperSrc.fileDetail(formData.fileName, formData.buffer);

                if (fileDetail.name === "" || fileDetail.mimeType === "" || fileDetail.size === "") {
                    result += "File input empty.";
                } else if (!helperSrc.fileCheckMimeType(fileDetail.mimeType)) {
                    result += "Mime type are not allowed.";
                } else if (!helperSrc.fileCheckSize(parseInt(fileDetail.size))) {
                    result += "File size exceeds limit.";
                }
            }
        }

        if (!parameterList.includes("file")) {
            result += "Parameter 'file' is missing.";
        }

        return result;
    };

    constructor() {}

    execute = (request: Request, isFileExists: boolean, isDecode: boolean, pathValue: string): Promise<CfdpModel.Iinput[]> => {
        return new Promise((resolve, reject) => {
            const contentType = request.headers["content-type"];

            const chunkList: Buffer[] = [];

            request.on("data", (data: Buffer) => {
                chunkList.push(data);
            });

            request.on("end", async () => {
                if (typeof contentType !== "string") {
                    reject(new Error("Content-type missing."));

                    return;
                }

                const buffer = Buffer.concat(chunkList);
                const formDataList = Cfdp.readInput(buffer, contentType);

                const resultCheckRequest = await this.checkRequest(formDataList);

                if (resultCheckRequest !== "") {
                    reject(new Error(resultCheckRequest));

                    return;
                } else {
                    for (let a = 0; a < formDataList.length; a++) {
                        const formData = formDataList[a];

                        if (formData.name === "file" && formData.fileName && formData.buffer) {
                            const fileNameDecode = isDecode ? decodeURIComponent(formData.fileName) : formData.fileName;
                            const fileDetail = await helperSrc.fileDetail(fileNameDecode, formData.buffer);
                            const path = `${pathValue}${fileDetail.baseName}/`;
                            const pathFile = `${path}${fileDetail.name}`;

                            Fs.mkdir(path, { recursive: true }, (error) => {
                                if (error) {
                                    helperSrc.writeLog("Upload.ts - execute() - request.on() - mkdir() - Error", error.message);

                                    reject(new Error(error.message));

                                    return;
                                } else {
                                    Fs.access(pathFile, Fs.constants.F_OK, (errorAccess) => {
                                        if (isFileExists && !errorAccess) {
                                            resolve([]);

                                            return;
                                        }

                                        helperSrc.fileWriteStream(pathFile, formData.buffer).then((resultFileWriteStream) => {
                                            if (typeof resultFileWriteStream !== "boolean" || !resultFileWriteStream) {
                                                reject(new Error("Write failed."));

                                                return;
                                            } else {
                                                resolve(formDataList);

                                                return;
                                            }
                                        });
                                    });
                                }
                            });

                            break;
                        }
                    }
                }
            });

            request.on("error", (error: Error) => {
                helperSrc.writeLog("Upload.ts - execute() - request.on() - Error", error.message);

                reject(new Error(error.message));

                return;
            });
        });
    };
}
