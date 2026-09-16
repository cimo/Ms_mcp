// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as model from "./Model.js";

// Method
const messageNotAvailable = "Service not available.";

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

const apiHtmlGenerate = async (bodyObject: model.IapiHtmlGenerateBody): Promise<string> => {
    return instance.api
        .post<string>(
            "/html-generate",
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
            helperSrc.writeLog("Process.ts - apiHtmlGenerate() - catch()", error.message);

            return "";
        });
};

export const databaseStore = async (mcpSessionId: string, fileName: string): Promise<string> => {
    const result = await apiStore({ mcpSessionId, fileName });

    if (result === "") {
        helperSrc.writeLog("Process.ts - databaseStore() - apiStore()", "Service not available.");

        return messageNotAvailable;
    }

    return result;
};

export const databaseSearch = async (mcpSessionId: string, prompt: string, entityList: string[], rowList?: number[]): Promise<string> => {
    const result = await apiSearch({ mcpSessionId, prompt, entityList, rowList: rowList ? rowList : [] });

    if (result === "") {
        helperSrc.writeLog("Process.ts - databaseSearch() - apiSearch()", "Service not available.");

        return JSON.stringify({ message: messageNotAvailable });
    }

    return JSON.stringify(result);
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    const result = await apiDelete({ mcpSessionId, fileName });

    if (result === "") {
        helperSrc.writeLog("Process.ts - databaseDelete() - apiDelete()", "Service not available.");

        return messageNotAvailable;
    }

    return result;
};

export const htmlGenerate = async (mcpSessionId: string): Promise<string> => {
    const result = await apiHtmlGenerate({ mcpSessionId });

    if (result === "") {
        helperSrc.writeLog("Process.ts - htmlGenerate() - apiHtmlGenerate()", "Service not available.");

        return messageNotAvailable;
    }

    return result;
};
