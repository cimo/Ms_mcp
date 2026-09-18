import { AsyncLocalStorage } from "async_hooks";
import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "./HelperSrc.js";
import * as model from "./model/Instance.js";

const protocol = helperSrc.localeFromEnvName() === "jp" ? "https" : "http";
const requestContext = new AsyncLocalStorage<model.IinstanceContext>();

export const api = new Cr(`${protocol}://${helperSrc.DOMAIN}:${helperSrc.SERVER_PORT}`);
export const apiFileConverter = new Cr(`${protocol}://${helperSrc.DOMAIN}:1043`);
export const apiFileDataExtractor = new Cr(`${protocol}://${helperSrc.DOMAIN}:1045`);

export const runWithContext = <T>(callback: () => Promise<T>): Promise<T> => {
    return requestContext.run({}, callback);
};

api.setRequestInterceptor((config: RequestInit) => {
    return {
        ...config,
        headers: {
            ...config.headers
        }
    };
});

api.setResponseInterceptor((response: Response) => {
    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});

apiFileConverter.setRequestInterceptor((config: RequestInit) => {
    const store = requestContext.getStore();
    const cookie = store && store.cookieFileConverter ? store.cookieFileConverter : "";

    return {
        ...config,
        headers: {
            ...config.headers,
            ...(cookie ? { Cookie: cookie } : {})
        }
    };
});

apiFileConverter.setResponseInterceptor((response: Response) => {
    const store = requestContext.getStore();
    const cookie = response.headers.get("set-cookie");

    if (store && cookie) {
        const cookieSplit = cookie.split(";")[0];

        let cookieValue: string | undefined;

        if (cookieSplit && cookieSplit.includes("=")) {
            cookieValue = cookieSplit.split("=")[1].trim();
        }

        if (cookieValue) {
            store.cookieFileConverter = cookieSplit;
        }

        if (response.url.endsWith("/logout")) {
            delete store.cookieFileConverter;
        }
    }

    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});

apiFileDataExtractor.setRequestInterceptor((config: RequestInit) => {
    const store = requestContext.getStore();
    const cookie = store && store.cookieFileDataExtractor ? store.cookieFileDataExtractor : "";

    return {
        ...config,
        headers: {
            ...config.headers,
            ...(cookie ? { Cookie: cookie } : {})
        }
    };
});

apiFileDataExtractor.setResponseInterceptor((response: Response) => {
    const store = requestContext.getStore();
    const cookie = response.headers.get("set-cookie");

    if (store && cookie) {
        const cookieSplit = cookie.split(";")[0];

        let cookieValue: string | undefined;

        if (cookieSplit && cookieSplit.includes("=")) {
            cookieValue = cookieSplit.split("=")[1].trim();
        }

        if (cookieValue) {
            store.cookieFileDataExtractor = cookieSplit;
        }

        if (response.url.endsWith("/logout")) {
            delete store.cookieFileDataExtractor;
        }
    }

    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});
