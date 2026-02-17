import { mouse, screen } from "@nut-tree-fork/nut-js";
import sharp, { Channels } from "sharp";

// Source
import * as helperSrc from "../../HelperSrc.js";

const drawCursor = async (buffer: Buffer): Promise<void> => {
    const cursor = Buffer.from(`<svg width="20" height="20"><circle cx="5" cy="5" r="5" fill="red"/></svg>`);

    const mousePosition = await mouse.getPosition();

    await sharp(buffer)
        .composite([{ input: cursor, top: mousePosition.y, left: mousePosition.x }])
        .toFile(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}tmp/screenshot.jpg`);
};

export const screenshot = async (): Promise<string> => {
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
        await drawCursor(imageBuffer);
    }

    return imageBuffer.toString("base64");
};
