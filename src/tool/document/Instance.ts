import { AsyncLocalStorage } from "async_hooks";
import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as model from "./Model.js";

const protocol = helperSrc.localeFromEnvName() === "jp" ? "https" : "http";
const requestContext = new AsyncLocalStorage<model.IinstanceContext>();

export const apiFileConverter = new Cr(`${protocol}://${helperSrc.DOMAIN}:1043`);
export const apiDocumentParser = new Cr(helperSrc.URL_API_ONNX_DP);

export const runWithContext = <T>(callback: () => Promise<T>): Promise<T> => {
    return requestContext.run({}, callback);
};

apiFileConverter.setRequestInterceptor((config: RequestInit) => {
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

apiDocumentParser.setRequestInterceptor((config: RequestInit) => {
    return {
        ...config,
        headers: {
            ...config.headers
        }
    };
});

apiDocumentParser.setResponseInterceptor((response: Response) => {
    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});
