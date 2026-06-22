// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as model from "./Model.js";

const apiLogin = async (): Promise<string> => {
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
            helperSrc.writeLog("Extractor.ts - login() - api(/login) - catch()", error.message);

            return "ko";
        });
};

const apiExtract = async (formData: FormData): Promise<model.ItoolOcrResult[]> => {
    return instance.api
        .post<modelHelperSrc.IresponseBody>("/api/extract", {}, formData)
        .then((resultApi) => {
            const data = resultApi.data;
            const stdout = JSON.parse(data.response.stdout);

            let resultList: model.ItoolOcrResult[] = [];

            for (let a = 0; a < stdout.length; a++) {
                const xList: number[] = [];
                const yList: number[] = [];

                for (let b = 0; b < stdout[a].polygon.length; b++) {
                    const point = stdout[a].polygon[b];

                    xList.push(point[0]);
                    yList.push(point[1]);
                }

                const xMin = Math.min(...xList);
                const xMax = Math.max(...xList);
                const yMin = Math.min(...yList);
                const yMax = Math.max(...yList);

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

            return resultList;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Extractor.ts - extract() - api(/extract) - catch()", error.message);

            return [];
        });
};

const apiLogout = async (): Promise<string> => {
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
            helperSrc.writeLog("Extractor.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
        });
};

export const execute = (mcpSessionId: string, language: string, fileName: string, searchText: string, mode: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let resultList: model.ItoolOcrResult[] = [];

        await apiLogin();

        const fileDetail = helperSrc.fileDetail(fileName);

        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/${fileName}`;

        const resultFileReadStream = await helperSrc.fileReadStream(input);

        if (Buffer.isBuffer(resultFileReadStream)) {
            const buffer = Buffer.from(resultFileReadStream);
            const blob = new Blob([buffer], { type: fileDetail.mimeType });

            const formData = new FormData();
            formData.append("language", language);
            formData.append("file", blob, fileDetail.fileName);
            formData.append("searchText", searchText);
            formData.append("mode", mode);

            resultList = await apiExtract(formData);
        } else {
            helperSrc.writeLog(`Extractor.ts - extract() - fileReadStream()`, resultFileReadStream.toString());
        }

        await apiLogout();

        return JSON.stringify(resultList);
    });
};
