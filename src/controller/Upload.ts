import { Request } from "express";
import Fs from "fs";
import { Cfdp, CfdpModel } from "@cimo/form-data_parser/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";

export default class Upload {
    // Variable

    // Method
    private checkRequest = (formDataList: CfdpModel.Iinput[]): string => {
        let result = "";

        const parameterList: string[] = [];

        for (let a = 0; a < formDataList.length; a++) {
            const formData = formDataList[a];

            parameterList.push(formData.name);

            if (formData.name === "file") {
                const fileDetail = helperSrc.fileDetail(formData.fileName, formData.buffer);

                if (fileDetail.fileName === "" || fileDetail.mimeType === "" || fileDetail.size === "") {
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
            const chunkList: Buffer[] = [];

            request.on("data", (data: Buffer) => {
                chunkList.push(data);
            });

            request.on("end", () => {
                const contentType = request.headers["content-type"];

                if (typeof contentType !== "string") {
                    reject(new Error("Content-type missing."));

                    return;
                }

                const buffer = Buffer.concat(chunkList);
                const formDataList = Cfdp.readInput(buffer, contentType);

                const resultCheckRequest = this.checkRequest(formDataList);

                if (resultCheckRequest === "") {
                    for (let a = 0; a < formDataList.length; a++) {
                        const formData = formDataList[a];

                        if (formData.name === "file" && formData.fileName && formData.buffer) {
                            const fileName = isDecode ? decodeURIComponent(formData.fileName) : formData.fileName;
                            const fileDetail = helperSrc.fileDetail(fileName, formData.buffer);
                            const path = `${pathValue}${fileDetail.baseName}/`;
                            const pathFile = `${path}${fileDetail.fileName}`;

                            Fs.mkdir(path, { recursive: true }, (error) => {
                                if (!error) {
                                    if (isFileExists) {
                                        Fs.access(pathFile, Fs.constants.F_OK, (error) => {
                                            if (!error) {
                                                reject(new Error("File exists."));

                                                return;
                                            }
                                        });
                                    }

                                    helperSrc.fileWriteStream(pathFile, formData.buffer, (resultFileWriteStream) => {
                                        if (typeof resultFileWriteStream === "boolean" && resultFileWriteStream) {
                                            resolve(formDataList);

                                            return;
                                        } else {
                                            reject(new Error("File write failed."));

                                            return;
                                        }
                                    });
                                } else {
                                    helperSrc.writeLog("Upload.ts - execute() - request.on() - mkdir() - Error", error.message);

                                    reject(new Error("Directory creation failed."));

                                    return;
                                }
                            });

                            break;
                        }
                    }
                } else {
                    reject(new Error(resultCheckRequest));

                    return;
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
