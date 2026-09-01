import Express, { Request, Response, NextFunction } from "express";
import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import CookieParser from "cookie-parser";
import Cors from "cors";
import * as Http from "http";
import * as Https from "https";
import Fs from "fs";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { Cc } from "@cimo/cronjob/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import ControllerUser from "./User.js";
import ControllerMicrosoft from "./Microsoft.js";
import ControllerAgent from "./Agent.js";
import ControllerSetting from "./Setting.js";
import ControllerTool from "./Tool.js";
import ControllerWorkspace from "./Workspace.js";
import ControllerRag from "./Rag.js";
import ControllerSkill from "./Skill.js";
import ControllerXvfb from "./Xvfb.js";

export default class Server {
    // Variable
    private corsOption: modelServer.Icors;
    private limiter: RateLimitRequestHandler;
    private app: Express.Express;
    private sessionObject: Record<string, modelServer.Isession>;

    private controllerTool: ControllerTool;
    private controllerXvfb: ControllerXvfb;
    private controllerSetting: ControllerSetting;
    private controllerAgent: ControllerAgent;

    // Method
    private loginRpc = async (request: Request, response: Response, mcpSessionId: string): Promise<void> => {
        const loginRpc = await this.controllerTool.loginRpc(request, response, mcpSessionId);

        if (loginRpc === "ko") {
            helperSrc.writeLog("Server.ts - api() - post(/login) - Error", "Failed to login.");

            helperSrc.responseBody({ state: "ko", message: "Failed to login." }, response, 500);
        } else {
            await this.controllerXvfb.start(mcpSessionId);

            await this.controllerSetting.tableCreate(mcpSessionId);
            await this.controllerAgent.tableCreate(mcpSessionId);

            helperSrc.responseBody({ state: "ok", message: "", data: mcpSessionId }, response, 200);
        }
    };

    constructor() {
        this.corsOption = {
            originList: JSON.parse(helperSrc.URL_CORS_ORIGIN) as string[],
            methodList: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
            preflightContinue: false,
            optionsSuccessStatus: 200
        };

        this.limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 100,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (request: Request) => {
                return helperSrc.headerClientIp(request).split(":").pop() as string;
            }
        });

        this.sessionObject = {};

        this.app = Express();

        this.controllerTool = {} as ControllerTool;
        this.controllerXvfb = {} as ControllerXvfb;
        this.controllerSetting = {} as ControllerSetting;
        this.controllerAgent = {} as ControllerAgent;
    }

    createSetting = (): void => {
        Ca.setCookieNameCustom("mcp-cookie");

        this.app.set("trust proxy", "loopback");
        this.app.use(Express.json());
        this.app.use(Express.urlencoded({ extended: true }));
        this.app.use(CookieParser());
        this.app.use(
            Cors({
                origin: this.corsOption.originList,
                methods: this.corsOption.methodList,
                optionsSuccessStatus: this.corsOption.optionsSuccessStatus
            })
        );
        this.app.use((request: modelServer.Irequest, response: Response, next: NextFunction) => {
            response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("Expires", "0");

            const remoteAddress = request.socket.remoteAddress ? request.socket.remoteAddress : "";

            request.clientIp = helperSrc.headerClientIp(request) || remoteAddress;

            next();
        });
        this.app.use("/asset", Express.static(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}asset/`));
        this.app.use("/file", this.limiter, Ca.authenticationMiddleware, Express.static(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}file/`));
    };

    createServer = (): void => {
        let creation: Http.Server | Https.Server;

        if (helperSrc.localeFromEnvName() === "jp") {
            creation = Https.createServer(
                {
                    key: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_KEY),
                    cert: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_CRT),
                    ca: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_PEM)
                },
                this.app
            );
        } else {
            creation = Http.createServer(this.app);
        }

        const server = creation;

        server.listen(helperSrc.SERVER_PORT, async () => {
            const controllerUser = new ControllerUser(this.app, this.limiter);
            controllerUser.api();
            await controllerUser.tableCreate();

            const controllerMicrosoft = new ControllerMicrosoft(this.app, this.limiter, controllerUser, this.loginRpc);
            controllerMicrosoft.api();

            this.controllerSetting = new ControllerSetting(this.app, this.limiter);
            this.controllerSetting.api();

            this.controllerAgent = new ControllerAgent(this.app, this.limiter);
            this.controllerAgent.api();

            this.controllerTool = new ControllerTool(this.app, this.limiter, this.sessionObject);
            this.controllerTool.api();
            this.controllerTool.rpc();

            const controllerWorkspace = new ControllerWorkspace(this.app, this.limiter, this.sessionObject);
            controllerWorkspace.api();

            const controllerRag = new ControllerRag(this.app, this.limiter, this.sessionObject);
            controllerRag.api();

            const controllerSkill = new ControllerSkill(this.app, this.limiter);
            controllerSkill.api();

            this.controllerXvfb = new ControllerXvfb(this.sessionObject);

            helperSrc.writeLog("Server.ts - createServer() - listen() - Port", helperSrc.SERVER_PORT);

            this.app.get("/", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
                if (!request.accepts("html")) {
                    response.status(404).send("/: html not found!");
                } else {
                    response.sendFile(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}index.html`);
                }
            });

            this.app.get("/info", (request: modelServer.Irequest, response: Response) => {
                helperSrc.responseBody({ state: "ok", message: "", data: `Client ip: ${request.clientIp || ""}` }, response, 200);
            });

            this.app.post("/login", this.limiter, async (request: Request, response: Response) => {
                Ca.writeCookie(`${helperSrc.LABEL}_authentication`, response);

                const mcpBearerToken = request.headers["mcp-bearer-token"];
                const body = request.body as modelServer.IapiLoginBody;

                if (typeof mcpBearerToken !== "string") {
                    helperSrc.writeLog("Server.ts - api() - post(/api/login) - Error", "Missing or invalid header.");

                    helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
                } else {
                    let loginSession = {} as modelServer.IdataLoginSession;

                    if (helperSrc.ENV_NAME.toLowerCase() === "local" || helperSrc.ENV_NAME.toLowerCase() === "dev") {
                        if (body.mode === "basic") {
                            loginSession = await controllerUser.loginBasicSessionVerify(body.username, body.password);
                        } else if (body.mode === "ad") {
                            loginSession = await controllerMicrosoft.loginWithAuthenticationCode(mcpBearerToken);
                        }
                    } else {
                        loginSession = await controllerMicrosoft.loginWithAuthenticationCode(mcpBearerToken);
                    }

                    if (loginSession.message !== "") {
                        helperSrc.responseBody({ state: "ko", message: loginSession.message }, response, 200);

                        return;
                    } else if (loginSession.mcpSessionId && loginSession.mcpSessionId !== "") {
                        await this.loginRpc(request, response, loginSession.mcpSessionId);
                    } else if (loginSession.adUrl && loginSession.adUrl !== "") {
                        helperSrc.responseBody({ state: "ok", message: "", data: loginSession.adUrl }, response, 200);
                    }
                }
            });

            this.app.get("/logout", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
                const mcpBearerToken = request.headers["mcp-bearer-token"];

                if (typeof mcpBearerToken !== "string") {
                    helperSrc.writeLog("Server.ts - api() - get(/logout) - Error", "Missing or invalid header.");

                    helperSrc.responseBody({ state: "ko", message: "Missing or invalid header." }, response, 500);
                } else {
                    controllerMicrosoft.logout(mcpBearerToken);

                    const logoutRpc = await this.controllerTool.logoutRpc(request);

                    Ca.deleteCookie(`${helperSrc.LABEL}_authentication`, request, response);

                    if (logoutRpc === "") {
                        helperSrc.writeLog("Server.ts - api() - get(/logout) - Error", "Failed to logout.");

                        helperSrc.responseBody({ state: "ko", message: "Failed to logout." }, response, 500);
                    } else {
                        await this.controllerXvfb.stop(logoutRpc);

                        helperSrc.responseBody({ state: "ok", message: "" }, response, 200);
                    }

                    delete this.sessionObject[logoutRpc];
                }
            });
        });
    };
}

const controllerServer = new Server();
controllerServer.createSetting();
controllerServer.createServer();

Cc.execute(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}cronjob/`);

helperSrc.keepProcess();
