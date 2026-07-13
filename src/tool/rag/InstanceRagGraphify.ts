import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "../../HelperSrc.js";

export const api = new Cr(helperSrc.URL_API_ONNX_RG);

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
        helperSrc.writeLog("InstanceRagGraphify.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});
