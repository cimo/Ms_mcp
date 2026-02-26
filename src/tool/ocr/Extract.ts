// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as model from "./Model.js";

const login = async (): Promise<string> => {
    let result = "";

    await instance.api
        .get<modelHelperSrc.IresponseBody>(
            "/login",
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            true
        )
        .then((resultApi) => {
            result = JSON.stringify(resultApi, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Extract.ts - login() - api(/login) - catch()", error.message);

            result = "ko";
        });

    return result;
};

const extract = async (language: string, fileName: string, searchText: string, mode: string): Promise<model.ItoolOcrResult[]> => {
    return new Promise<model.ItoolOcrResult[]>((resolve, reject) => {
        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${fileName}`;

        helperSrc.fileReadStream(input, async (resultFileReadStream) => {
            if (Buffer.isBuffer(resultFileReadStream)) {
                helperSrc.fileOrFolderRemove(input, (resultFileRemove) => {
                    if (typeof resultFileRemove !== "boolean") {
                        helperSrc.writeLog("Extract.ts - extract() - fileReadStream() - fileOrFolderRemove(input)", resultFileRemove.toString());
                    }
                });

                const buffer = Buffer.from(resultFileReadStream);
                const mimeType = helperSrc.readMimeType(buffer);
                const blob = new Blob([buffer], { type: mimeType.content });

                const formData = new FormData();
                formData.append("language", language);
                formData.append("file", blob, `${fileName}`);
                formData.append("searchText", searchText);
                formData.append("mode", mode);

                await instance.api
                    .post<modelHelperSrc.IresponseBody>("/api/extract", {}, formData)
                    .then((resultApi) => {
                        let resultList: model.ItoolOcrResult[] = [];

                        const stdoutList: model.ItoolOcrResponse[] = JSON.parse(resultApi.response.stdout);

                        for (const stdout of stdoutList) {
                            const x: number[] = [];
                            const y: number[] = [];

                            for (const point of stdout.polygon) {
                                x.push(point[0]);
                                y.push(point[1]);
                            }

                            const xMin = Math.min(...x);
                            const xMax = Math.max(...x);
                            const yMin = Math.min(...y);
                            const yMax = Math.max(...y);

                            resultList.push({
                                id: stdout.id,
                                text: stdout.text,
                                centerPoint: {
                                    x: (xMin + xMax) / 2,
                                    y: (yMin + yMax) / 2
                                },
                                isMatch: stdout.isMatch
                            });
                        }

                        resolve(resultList);

                        return;
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Extract.ts - extract() - api(/extract) - catch()", error.message);

                        reject("ko");

                        return;
                    });
            } else {
                reject("File input not exists.");

                return;
            }
        });
    });
};

const logout = async (): Promise<string> => {
    let result = "";

    await instance.api
        .get<modelHelperSrc.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            result = JSON.stringify(resultApi, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Extract.ts - logout() - api(/logout) - catch()", error.message);

            result = "ko";
        });

    return result;
};

export const execute = async (language: string, fileName: string, searchText: string, mode: string): Promise<string> => {
    return await instance.runWithContext(async () => {
        let result: model.ItoolOcrResult[] = [];

        await login();

        result = await extract(language, fileName, searchText, mode).catch((error: Error) => {
            helperSrc.writeLog("Extract.ts - execute() - extract() - catch()", error);

            return [];
        });

        await logout();

        return JSON.stringify(result);
    });
};
