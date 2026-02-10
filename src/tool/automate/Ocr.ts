// Source
import * as instance from "./InstanceOcr.js";
import * as model from "../model/Automate.js";

export const login = async (sessionId: string): Promise<string> => {
    let result = "";

    await instance.api
        .get<model.IresponseBody>("/login", {
            headers: {
                "Content-Type": "application/json",
                "X-Endpoint": "/login",
                "X-Session-Id": sessionId
            }
        })
        .then((response) => {
            result = JSON.stringify(response, null, 2);
        })
        .catch((error: Error) => {
            throw new Error(error.message);
        });

    return result;
};

export const extract = async (
    sessionId: string,
    image: string,
    searchText: string | undefined,
    dataType: string
): Promise<model.ItoolOcrResult[]> => {
    let resultList: model.ItoolOcrResult[] = [];

    const buffer = Buffer.from(image, "base64");
    const blob = new Blob([buffer], { type: "image/jpg" });

    const formData = new FormData();
    formData.append("language", "");
    formData.append("file", blob, "screenshot.jpg");
    formData.append("searchText", searchText || "");
    formData.append("dataType", dataType);

    await instance.api
        .post<model.ItoolOcrResponse[]>(
            "/api/extract",
            {
                headers: {
                    "X-Endpoint": "/api/extract",
                    "X-Session-Id": sessionId
                }
            },
            formData
        )
        .then((response) => {
            for (const stdout of Object.values(response)) {
                const x = stdout.polygon.map((point: number[]) => point[0]);
                const y = stdout.polygon.map((point: number[]) => point[1]);
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
                    match: stdout.match
                });
            }
        })
        .catch((error: Error) => {
            throw new Error(error.message);
        });

    return resultList;
};

export const logout = async (sessionId: string): Promise<string> => {
    let result = "";

    await instance.api
        .get<model.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json",
                "X-Endpoint": "/logout",
                "X-Session-Id": sessionId
            }
        })
        .then((response) => {
            result = JSON.stringify(response, null, 2);
        })
        .catch((error: Error) => {
            throw new Error(error.message);
        });

    return result;
};
