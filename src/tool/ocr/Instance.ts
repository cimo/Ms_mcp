import { AsyncLocalStorage } from "async_hooks";
import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as model from "./Model.js";

const protocol = helperSrc.localeFromEnvName() === "jp" ? "https" : "http";

export const api = new Cr(`${protocol}://${helperSrc.DOMAIN}:1045`);

const requestContext = new AsyncLocalStorage<model.IinstanceContext>();

export const runWithContext = async <T>(callback: () => Promise<T>): Promise<T> => {
    return await requestContext.run({}, callback);
};

api.setRequestInterceptor((config: RequestInit) => {
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

api.setResponseInterceptor((response: Response) => {
    const store = requestContext.getStore();

    const cookie = response.headers.get("set-cookie");

    if (store) {
        const cookieSplit = cookie ? cookie.split(";")[0] : undefined;
        const cookieValue = cookieSplit ? cookieSplit.split("=")[1].trim() : undefined;

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
