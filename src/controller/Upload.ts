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

        for (const formData of formDataList) {
            parameterList.push(formData.name);

            if (formData.name === "file") {
                if (formData.fileName === "" || formData.mimeType === "" || formData.size === "") {
                    result += "File input empty.";
                } else if (!helperSrc.fileCheckMimeType(formData.mimeType)) {
                    result += "Mime type are not allowed.";
                } else if (!helperSrc.fileCheckSize(parseInt(formData.size))) {
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

    execute = (request: Request, isFileExists: boolean, pathValue: string): Promise<boolean> => {
        return new Promise((resolve) => {
            const chunkList: Buffer[] = [];

            request.on("data", (data: Buffer) => {
                chunkList.push(data);
            });

            request.on("end", () => {
                const contentType = request.headers["content-type"];

                const buffer = Buffer.concat(chunkList);
                const formDataList = Cfdp.readInput(buffer, contentType);

                const resultCheckRequest = this.checkRequest(formDataList);

                if (resultCheckRequest === "") {
                    for (const formData of formDataList) {
                        if (formData.name === "file" && formData.fileName && formData.buffer) {
                            const baseFileName = helperSrc.baseFileName(formData.fileName);
                            const path = `${pathValue}${baseFileName}/`;
                            const pathFile = `${path}${formData.fileName}`;

                            Fs.mkdir(path, { recursive: true }, (error) => {
                                if (!error) {
                                    if (isFileExists) {
                                        Fs.access(pathFile, Fs.constants.F_OK, (error) => {
                                            if (!error) {
                                                helperSrc.writeLog("Upload.ts - execute() - request.on() - access() - Error", "File exists.");

                                                resolve(false);

                                                return;
                                            }
                                        });
                                    }

                                    helperSrc.fileWriteStream(pathFile, formData.buffer, (resultFileWriteStream) => {
                                        if (typeof resultFileWriteStream === "boolean" && resultFileWriteStream) {
                                            resolve(true);

                                            return;
                                        } else {
                                            helperSrc.writeLog(
                                                "Upload.ts - execute() - request.on() - fileWriteStream() - Error",
                                                "File write failed."
                                            );

                                            resolve(false);

                                            return;
                                        }
                                    });
                                } else {
                                    helperSrc.writeLog("Upload.ts - execute() - request.on() - mkdir() - Error", error.message);

                                    resolve(false);

                                    return;
                                }
                            });

                            break;
                        }
                    }
                } else {
                    helperSrc.writeLog("Upload.ts - execute() - request.on() - checkRequest() - Error", resultCheckRequest);

                    resolve(false);

                    return;
                }
            });

            request.on("error", (error: Error) => {
                helperSrc.writeLog("Upload.ts - execute() - request.on() - Error", error.message);

                resolve(false);

                return;
            });
        });
    };
}
