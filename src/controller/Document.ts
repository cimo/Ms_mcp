import { unzip } from "fflate";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelHelperSrc from "../model/HelperSrc.js";

export default class Document {
    // Variable

    // Method
    private apiFileConverterLogin = async (): Promise<string> => {
        return instance.apiFileConverter
            .get<modelHelperSrc.IapiResponse>("/login", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileConverterLogin() - catch()", error.message);

                return "ko";
            });
    };

    private apiToPdf = async (formData: FormData): Promise<string> => {
        return instance.apiFileConverter
            .post<modelHelperSrc.IapiResponse>("/api/toPdf", {}, formData)
            .then((resultApi) => {
                const data = resultApi.data;

                if (data.response.state !== "ok") {
                    helperSrc.writeLog("Document.ts - apiToPdf() - Error", data.response.message as string);

                    return "ko";
                }

                return data.response.data as string;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiToPdf() - catch()", error.message);

                return "ko";
            });
    };

    private apiFileConverterLogout = async (): Promise<string> => {
        return instance.apiFileConverter
            .get<modelHelperSrc.IapiResponse>("/logout", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileConverterLogout() - catch()", error.message);

                return "ko";
            });
    };

    private apiFileDataExtractorLogin = async (): Promise<string> => {
        return instance.apiFileDataExtractor
            .get<modelHelperSrc.IapiResponse>("/login", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileDataExtractorLogin() - catch()", error.message);

                return "ko";
            });
    };

    private apiExtract = async (formData: FormData): Promise<string> => {
        return instance.apiFileDataExtractor
            .post<modelHelperSrc.IapiResponse>("/api/extract", {}, formData)
            .then((resultApi) => {
                const data = resultApi.data;

                if (data.response.state !== "ok") {
                    helperSrc.writeLog("Document.ts - apiExtract() - Error", data.response.message as string);

                    return "ko";
                }

                return data.response.data as string;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiExtract() - catch()", error.message);

                return "ko";
            });
    };

    private apiFileDataExtractorLogout = async (): Promise<string> => {
        return instance.apiFileDataExtractor
            .get<modelHelperSrc.IapiResponse>("/logout", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileDataExtractorLogout() - catch()", error.message);

                return "ko";
            });
    };

    private resultZipWrite = (buffer: Buffer, pathCurrent: string): Promise<void> => {
        return new Promise<void>((resolve) => {
            unzip(buffer, async (error: Error | null, zip: Record<string, Uint8Array>) => {
                if (error) {
                    helperSrc.writeLog("Document.ts - resultZipWrite() - unzip()", error.message);

                    resolve();

                    return;
                }

                const entryList = Object.keys(zip);

                for (let a = 0; a < entryList.length; a++) {
                    const entry = entryList[a];

                    if (entry.endsWith("/")) {
                        continue;
                    }

                    const fileWriteStream = await helperSrc.fileWriteStream(`${pathCurrent}${entry}`, Buffer.from(zip[entry]));

                    if (typeof fileWriteStream !== "boolean") {
                        helperSrc.writeLog("Document.ts - resultZipWrite() - fileWriteStream()", fileWriteStream.toString());
                    }
                }

                resolve();
            });
        });
    };

    constructor() {}

    execute = (fileDetail: modelHelperSrc.IfileDetail, pathCurrent: string): Promise<string> => {
        return instance.runWithContext(async () => {
            const fileReadStream = await helperSrc.fileReadStream(`${pathCurrent}${fileDetail.name}`);

            if (!Buffer.isBuffer(fileReadStream)) {
                helperSrc.writeLog("Document.ts - execute() - fileReadStream()", fileReadStream.toString());

                return "The file was not found in the workspace, check the name and try again.";
            }

            const buffer = Buffer.from(fileReadStream);
            const blob = new Blob([buffer], { type: fileDetail.mimeType });

            if (fileDetail.category === "document" && fileDetail.extension !== "pdf") {
                const formDataFileConverter = new FormData();
                formDataFileConverter.append("file", blob, fileDetail.name);

                await this.apiFileConverterLogin();

                const resultToPdf = await this.apiToPdf(formDataFileConverter);

                await this.apiFileConverterLogout();

                if (resultToPdf === "ko") {
                    helperSrc.writeLog("Document.ts - execute() - apiToPdf()", "Service not available.");

                    return "Service not available.";
                }

                const fileWriteStream = await helperSrc.fileWriteStream(`${pathCurrent}converted.pdf`, Buffer.from(resultToPdf, "base64"));

                if (typeof fileWriteStream !== "boolean") {
                    helperSrc.writeLog("Document.ts - execute() - fileWriteStream()", fileWriteStream.toString());
                }
            }

            const formDataFileDataExtractor = new FormData();
            formDataFileDataExtractor.append("file", blob, fileDetail.name);

            await this.apiFileDataExtractorLogin();

            const resultExtract = await this.apiExtract(formDataFileDataExtractor);

            await this.apiFileDataExtractorLogout();

            if (resultExtract === "ko") {
                helperSrc.writeLog("Document.ts - execute() - apiExtract()", "Service not available.");

                return "Service not available.";
            }

            await this.resultZipWrite(Buffer.from(resultExtract, "base64"), pathCurrent);

            return "";
        });
    };
}
