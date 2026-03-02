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

    execute = (request: Request, isFileExists: boolean, path: string): Promise<CfdpModel.Iinput[]> => {
        return new Promise((resolve, reject) => {
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
                            const input = `${path}${formData.fileName}`;

                            Fs.mkdir(`${path}`, { recursive: true }, (error) => {
                                if (error) {
                                    helperSrc.writeLog("Upload.ts - execute() - request.on() - mkdir() - Error", error.message);

                                    reject(new Error("Directory creation failed."));

                                    return;
                                }
                            });

                            if (isFileExists) {
                                Fs.access(input, Fs.constants.F_OK, (error) => {
                                    if (!error) {
                                        reject(new Error("File exists."));

                                        return;
                                    }
                                });
                            }

                            helperSrc.fileWriteStream(input, formData.buffer, (resultFileWriteStream) => {
                                if (typeof resultFileWriteStream === "boolean" && resultFileWriteStream) {
                                    resolve(formDataList);

                                    return;
                                } else {
                                    reject(new Error("File write failed."));

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

                reject(error);

                return;
            });
        });
    };
}
