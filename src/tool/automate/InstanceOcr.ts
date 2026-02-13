import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as model from "../model/Automate.js";

export const api = new Cr("http://localhost:1045");

let cookieObject: Record<string, string> = {};

api.setRequestInterceptor((config: RequestInit) => {
    let cookie = "";

    if (config.headers) {
        const header = config.headers as unknown as model.IresponseHeader;

        cookie = cookieObject[header["x-session-id"]] || "";

        if (header["x-endpoint"] === "/login") {
            cookieObject[header["x-session-id"]] = "";
            cookie = "";
        }
    }

    return {
        ...config,
        headers: {
            ...config.headers,
            Cookie: cookie
        },
        credentials: "include"
    };
});

api.setResponseInterceptor((response: Response) => {
    const setCookie = response.headers.get("set-cookie");
    const sessionId = response.headers.get("x-session-id");
    const endpoint = response.headers.get("x-endpoint");

    if (endpoint === "/login") {
        if (sessionId && setCookie) {
            cookieObject[sessionId] = setCookie;
        }
    } else if (endpoint === "/logout") {
        if (sessionId) {
            delete cookieObject[sessionId];
        }
    }

    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - responseLogic() - Error", response.status.toString());
    }

    return response;
});
