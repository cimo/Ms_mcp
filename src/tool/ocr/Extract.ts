// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as model from "./Model.js";

const login = async (): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/login", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Extract.ts - login() - api(/login) - catch()", error.message);

            return "ko";
        });
};

const extract = (mcpSessionId: string, language: string, fileName: string, searchText: string, mode: string): Promise<model.ItoolOcrResult[]> => {
    return new Promise((resolve, reject) => {
        const fileDetail = helperSrc.fileDetail(fileName);

        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/${fileName}`;

        helperSrc.fileReadStream(input).then((resultFileReadStream) => {
            if (Buffer.isBuffer(resultFileReadStream)) {
                const buffer = Buffer.from(resultFileReadStream);
                const blob = new Blob([buffer], { type: fileDetail.mimeType });

                const formData = new FormData();
                formData.append("language", language);
                formData.append("file", blob, fileDetail.fileName);
                formData.append("searchText", searchText);
                formData.append("mode", mode);

                instance.api
                    .post<modelHelperSrc.IresponseBody>("/api/extract", {}, formData)
                    .then((resultApi) => {
                        const stdout = JSON.parse(resultApi.data.response.stdout) as model.ItoolOcrResponse[];

                        let resultList: model.ItoolOcrResult[] = [];

                        for (let a = 0; a < stdout.length; a++) {
                            const x: number[] = [];
                            const y: number[] = [];

                            for (let b = 0; b < stdout[a].polygon.length; b++) {
                                const point = stdout[a].polygon[b];

                                x.push(point[0]);
                                y.push(point[1]);
                            }

                            const xMin = Math.min(...x);
                            const xMax = Math.max(...x);
                            const yMin = Math.min(...y);
                            const yMax = Math.max(...y);

                            resultList.push({
                                id: stdout[a].id,
                                text: stdout[a].text,
                                centerPoint: {
                                    x: (xMin + xMax) / 2,
                                    y: (yMin + yMax) / 2
                                },
                                isMatch: stdout[a].isMatch
                            });
                        }

                        resolve(resultList);
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Extract.ts - extract() - api(/extract) - catch()", error.message);

                        reject(new Error(error.message));
                    });
            } else {
                helperSrc.writeLog(`Extract.ts - extract() - fileReadStream()`, resultFileReadStream.toString());

                reject(new Error(resultFileReadStream.toString()));
            }
        });
    });
};

const logout = async (): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Extract.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
        });
};

export const execute = (mcpSessionId: string, language: string, fileName: string, searchText: string, mode: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let resultList: model.ItoolOcrResult[] = [];

        await login();

        resultList = await extract(mcpSessionId, language, fileName, searchText, mode);

        await logout();

        return JSON.stringify(resultList);
    });
};
