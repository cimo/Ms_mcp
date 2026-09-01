import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import * as Crypto from "crypto";
import { ConfidentialClientApplication, Configuration, AuthorizationUrlRequest, AuthorizationCodeRequest } from "@azure/msal-node";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { Ce } from "@cimo/environment/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as modelMicrosoft from "../model/Microsoft.js";
import ControllerUser from "./User.js";

export const ENV_NAME = Ce.checkVariable("ENV_NAME") || (process.env["ENV_NAME"] as string);

Ce.loadFile(`./env/${ENV_NAME}.microsoft.env`);

export const AD_URL_LOGIN = Ce.checkVariable("MS_MCP_AD_URL_LOGIN") || (process.env["MS_MCP_URL_AD_LOGIN"] as string);
export const AD_URL_REDIRECT = Ce.checkVariable("MS_MCP_AD_URL_REDIRECT") || (process.env["MS_MCP_URL_AD_REDIRECT"] as string);
export const AD_SCOPE = Ce.checkVariable("MS_MCP_AD_SCOPE") || (process.env["MS_MCP_AD_SCOPE"] as string);

Ce.loadFile(`./env/${ENV_NAME}.secret.microsoft.env`);

export const AD_TENANT = Ce.checkVariable("MS_MCP_AD_TENANT");
export const AD_CLIENT = Ce.checkVariable("MS_MCP_AD_CLIENT");
export const AD_CLIENT_KEY = Ce.checkVariable("MS_MCP_AD_CLIENT_KEY");

export default class Microsoft {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;
    private controllerUser: ControllerUser;
    private loginRpc: (request: Request, response: Response, mcpSessionId: string) => Promise<void>;

    private userObject: Record<string, modelMicrosoft.Iuser>;
    private claimsJsonObject: string;
    private configurationObject: Configuration;

    // Method
    private base64Url(input: Buffer | string): string {
        const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");

        return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    private generatePkceCode = (): Record<string, string> => {
        const verifier = this.base64Url(Crypto.randomBytes(32));
        const challenge = this.base64Url(Crypto.createHash("sha256").update(verifier).digest());

        return { verifier, challenge };
    };

    constructor(
        app: Express.Express,
        limiter: RateLimitRequestHandler,
        controllerUser: ControllerUser,
        loginRpc: (request: Request, response: Response, mcpSessionId: string) => Promise<void>
    ) {
        this.app = app;
        this.limiter = limiter;
        this.controllerUser = controllerUser;
        this.loginRpc = loginRpc;

        this.userObject = {};

        this.claimsJsonObject = JSON.stringify({
            id_token: { acrs: { essential: true, values: ["C1"] } },
            access_token: { acrs: { essential: true, values: ["C1"] } }
        });

        this.configurationObject = {
            auth: {
                clientId: AD_CLIENT,
                clientSecret: AD_CLIENT_KEY,
                authority: `${AD_URL_LOGIN}/${AD_TENANT}`
            }
        };
    }

    loginWithAuthenticationCode = async (bearerToken: string): Promise<modelServer.IdataLoginSession> => {
        const resultObject = {} as modelServer.IdataLoginSession;

        if (!AD_URL_LOGIN || !AD_URL_REDIRECT || !AD_SCOPE || !AD_TENANT || !AD_CLIENT || !AD_CLIENT_KEY) {
            resultObject.adUrl = "";
            resultObject.message = `Warning: Configure '${ENV_NAME}.microsoft.env' and '${ENV_NAME}.secret.microsoft.env' file.`;
        } else {
            const { verifier: codeVerifier, challenge: codeChallenge } = this.generatePkceCode();

            const parameterObject: AuthorizationUrlRequest = {
                scopes: JSON.parse(AD_SCOPE) as string[],
                redirectUri: AD_URL_REDIRECT,
                state: `${codeVerifier}:-:${bearerToken}`,
                codeChallenge,
                codeChallengeMethod: "S256",
                claims: this.claimsJsonObject
            };

            const cca = new ConfidentialClientApplication(this.configurationObject);

            resultObject.adUrl = await cca.getAuthCodeUrl(parameterObject);
            resultObject.message = "";
        }

        return resultObject;
    };

    codeToToken = async (code: string, state: string): Promise<modelMicrosoft.IdataToken> => {
        const stateSplit = state.split(":-:");

        const tokenRequestObject: AuthorizationCodeRequest = {
            code,
            redirectUri: AD_URL_REDIRECT,
            scopes: JSON.parse(AD_SCOPE) as string[],
            codeVerifier: stateSplit[0],
            claims: this.claimsJsonObject
        };

        const cca = new ConfidentialClientApplication(this.configurationObject);

        const authObject = await cca.acquireTokenByCode(tokenRequestObject);

        let username = "";

        if (authObject.account) {
            username = authObject.account.username;
        }

        return {
            bearerToken: stateSplit[1],
            username,
            accessToken: authObject.accessToken
        };
    };

    logout = (bearerToken: string): void => {
        if (bearerToken in this.userObject) {
            delete this.userObject[bearerToken];
        }
    };

    api = (): void => {
        this.app.get("/ad-redirect", this.limiter, (request: Request, response: Response) => {
            const code = request.query["code"];
            const state = request.query["state"];

            if (typeof code !== "string" || typeof state !== "string") {
                helperSrc.writeLog("Microsoft.ts - api() - get(/ad-redirect) - Error", "Missing or invalid query parameters.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid query parameters." }, response, 500);
            } else {
                this.codeToToken(code, state)
                    .then(async (result) => {
                        const user = await this.controllerUser.tableSelect(result.username, "");

                        let mcpSessionId = "";

                        if (user.id) {
                            if (user.mcpSessionId) {
                                mcpSessionId = user.mcpSessionId;
                            } else {
                                mcpSessionId = helperSrc.generateUniqueId();

                                await this.controllerUser.tableUpdate(user.id, user.name, user.surname, "", mcpSessionId);
                            }
                        }

                        this.userObject[result.bearerToken] = {
                            ...this.userObject[result.bearerToken],
                            username: result.username,
                            accessToken: result.accessToken,
                            mcpSessionId: mcpSessionId
                        };

                        if (!request.accepts("html")) {
                            response.status(404).send("/: html not found!");
                        } else {
                            response.sendFile(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}ad_redirect.html`);
                        }
                    })
                    .catch((error: Error) => {
                        helperSrc.writeLog("Microsoft.ts - api() - get(/ad-redirect) - codeToToken() - catch()", error.message);

                        helperSrc.responseBody({ state: "ko", message: "Failed to get access token." }, response, 500);
                    });
            }
        });

        this.app.get("/ad-verify", Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpBearerToken = request.headers["mcp-bearer-token"];

            if (typeof mcpBearerToken !== "string") {
                helperSrc.writeLog("Microsoft.ts - api() - get(/ad-verify) - Error", "Missing or invalid header.");

                helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
            } else {
                if (!(mcpBearerToken in this.userObject)) {
                    helperSrc.responseBody({ state: "ongoing", message: "" }, response, 200);
                } else {
                    await this.loginRpc(request, response, this.userObject[mcpBearerToken].mcpSessionId);
                }
            }
        });
    };
}
