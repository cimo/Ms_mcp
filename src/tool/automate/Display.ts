import Path from "path";
import Fs from "fs";
import { mouse, screen } from "@nut-tree-fork/nut-js";
import sharp, { Channels } from "sharp";

// Source
import * as helperSrc from "../../HelperSrc.js";

const drawCursor = async (mcpSessionId: string, buffer: Buffer): Promise<void> => {
    const pathFile = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/screenshot.jpg`;

    const directory = Path.dirname(pathFile);
    Fs.mkdirSync(directory, { recursive: true });

    const cursor = Buffer.from(`<svg width="20" height="20"><circle cx="5" cy="5" r="5" fill="red"/></svg>`);

    const mousePosition = await mouse.getPosition();

    sharp(buffer)
        .composite([{ input: cursor, top: mousePosition.y, left: mousePosition.x }])
        .toFile(pathFile);
};

export const screenshot = async (mcpSessionId: string): Promise<string> => {
    const imagePixel = await screen.grab();
    const imageRbg = await imagePixel.toRGB();
    const imageBuffer = await sharp(imageRbg.data, {
        raw: {
            width: imageRbg.width,
            height: imageRbg.height,
            channels: imageRbg.channels as Channels
        }
    })
        .jpeg()
        .removeAlpha()
        .toBuffer();

    if (helperSrc.IS_DEBUG) {
        drawCursor(mcpSessionId, imageBuffer);
    }

    return imageBuffer.toString("base64");
};
