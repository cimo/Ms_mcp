// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as model from "./Model.js";

// Method
const apiStore = async (bodyObject: model.IapiStoreBody): Promise<string> => {
    return instance.api
        .post<string>(
            "/store",
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            bodyObject
        )
        .then((resultApi) => {
            return resultApi.data;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Process.ts - apiStore() - catch()", error.message);

            return "";
        });
};

const apiSearch = async (bodyObject: model.IapiSearchBody): Promise<unknown> => {
    return instance.api
        .post<unknown>(
            "/search",
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            bodyObject
        )
        .then((resultApi) => {
            return resultApi.data;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Process.ts - apiSearch() - catch()", error.message);

            return "";
        });
};

const apiDelete = async (bodyObject: model.IapiDeleteBody): Promise<string> => {
    return instance.api
        .post<string>(
            "/delete",
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            bodyObject
        )
        .then((resultApi) => {
            return resultApi.data;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Process.ts - apiDelete() - catch()", error.message);

            return "";
        });
};

export const databaseStore = async (mcpSessionId: string, fileName: string): Promise<string> => {
    return apiStore({ mcpSessionId, fileName });
};

export const databaseSearch = async (mcpSessionId: string, prompt: string, entityList: string[], rowList: number[]): Promise<string> => {
    const result = await apiSearch({ mcpSessionId, prompt, entityList, rowList });

    return JSON.stringify(result);
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    return apiDelete({ mcpSessionId, fileName });
};
