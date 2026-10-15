import { Request } from "express";
import Fs from "fs";
import { Cfdp, CfdpModel } from "@cimo/form-data_parser/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelUpload from "../model/Upload.js";

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

                if (fileDetail.name === "" || fileDetail.mimeType === "" || formData.buffer.length === 0) {
                    result += "File input empty.";
                } else if (!helperSrc.fileCheckMimeType(fileDetail.mimeType)) {
                    result += "Mime type are not allowed.";
                } else if (!helperSrc.fileCheckSize(formData.buffer.length)) {
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

    execute = (request: Request, isFileExists: boolean, isDecode: boolean, pathValue: string): Promise<modelUpload.Iresult> => {
        return new Promise((resolve, reject) => {
            const contentType = request.headers["content-type"];

            const chunkList: Buffer[] = [];

            let bodySize = 0;
            let isBodySizeExceeded = false;

            request.on("data", (data: Buffer) => {
                bodySize += data.length;

                if (!helperSrc.fileCheckSize(bodySize)) {
                    isBodySizeExceeded = true;
                    chunkList.length = 0;
                }

                if (!isBodySizeExceeded) {
                    chunkList.push(data);
                }
            });

            request.on("end", async () => {
                if (isBodySizeExceeded) {
                    resolve({ formDataList: [], message: "File size exceeds limit." });

                    return;
                }

                if (typeof contentType !== "string") {
                    resolve({ formDataList: [], message: "Content-type missing." });

                    return;
                }

                const buffer = Buffer.concat(chunkList);
                const formDataList = Cfdp.readInput(buffer, contentType);

                const resultCheckRequest = await this.checkRequest(formDataList);

                if (resultCheckRequest !== "") {
                    resolve({ formDataList: [], message: resultCheckRequest });

                    return;
                } else {
                    for (let a = 0; a < formDataList.length; a++) {
                        const formData = formDataList[a];

                        if (formData.name === "file" && formData.fileName && formData.buffer) {
                            if (isDecode && !helperSrc.checkUriComponent(formData.fileName)) {
                                resolve({ formDataList: [], message: "Invalid file name." });

                                return;
                            }

                            const fileNameDecode = isDecode ? decodeURIComponent(formData.fileName) : formData.fileName;
                            const fileDetail = await helperSrc.fileDetail(fileNameDecode, formData.buffer);
                            const path = `${pathValue}${fileDetail.baseName}/`;
                            const pathFile = `${path}${fileDetail.name}`;

                            Fs.mkdir(path, { recursive: true }, async (error) => {
                                if (error) {
                                    helperSrc.writeLog("Upload.ts - execute() - request.on() - mkdir() - Error", error.message);

                                    reject(new Error(error.message));

                                    return;
                                } else {
                                    const isExists = await helperSrc.fileOrFolderExists(pathFile);

                                    if (isFileExists && isExists) {
                                        resolve({ formDataList: [], message: "File already exists." });
                                    } else {
                                        helperSrc.fileWriteStream(pathFile, formData.buffer).then((resultFileWriteStream) => {
                                            if (typeof resultFileWriteStream !== "boolean" || !resultFileWriteStream) {
                                                reject(new Error("Write failed."));

                                                return;
                                            } else {
                                                resolve({ formDataList, message: "" });

                                                return;
                                            }
                                        });
                                    }
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
