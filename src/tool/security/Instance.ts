import { AsyncLocalStorage } from "async_hooks";
import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as model from "./Model.js";

const protocol = helperSrc.localeFromEnvName() === "jp" ? "https" : "http";
const requestContext = new AsyncLocalStorage<model.IinstanceContext>();

export const apiScanner = new Cr(`${protocol}://${helperSrc.DOMAIN}:1048`);
export const apiAntivirus = new Cr(`${protocol}://${helperSrc.DOMAIN}:1042`);

export const runWithContext = <T>(callback: () => Promise<T>): Promise<T> => {
    return requestContext.run({}, callback);
};

apiScanner.setRequestInterceptor((config: RequestInit) => {
    const store = requestContext.getStore();
    const cookie = store && store.cookie ? store.cookie : "";

    return {
        ...config,
        headers: {
            ...config.headers,
            ...(cookie ? { Cookie: cookie } : {})
        }
    };
});

apiScanner.setResponseInterceptor((response: Response) => {
    const store = requestContext.getStore();
    const cookie = response.headers.get("set-cookie");

    if (store && cookie) {
        const cookieSplit = cookie.split(";")[0];

        let cookieValue: string | undefined;

        if (cookieSplit && cookieSplit.includes("=")) {
            cookieValue = cookieSplit.split("=")[1].trim();
        }

        if (cookieValue) {
            store.cookie = cookieSplit;
        }

        if (response.url.endsWith("/logout")) {
            delete store.cookie;
        }
    }

    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});

apiAntivirus.setRequestInterceptor((config: RequestInit) => {
    const store = requestContext.getStore();
    const cookie = store && store.cookie ? store.cookie : "";

    return {
        ...config,
        headers: {
            ...config.headers,
            ...(cookie ? { Cookie: cookie } : {})
        }
    };
});

apiAntivirus.setResponseInterceptor((response: Response) => {
    const store = requestContext.getStore();
    const cookie = response.headers.get("set-cookie");

    if (store && cookie) {
        const cookieSplit = cookie.split(";")[0];

        let cookieValue: string | undefined;

        if (cookieSplit && cookieSplit.includes("=")) {
            cookieValue = cookieSplit.split("=")[1].trim();
        }

        if (cookieValue) {
            store.cookie = cookieSplit;
        }

        if (response.url.endsWith("/logout")) {
            delete store.cookie;
        }
    }

    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});
