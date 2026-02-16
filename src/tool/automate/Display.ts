import { mouse, screen, FileType } from "@nut-tree-fork/nut-js";
import sharp, { Channels } from "sharp";

// Source
import * as helperSrc from "../../HelperSrc.js";

const drawCursor = async (file: string): Promise<void> => {
    const cursor = Buffer.from(`<svg width="20" height="20"><circle cx="5" cy="5" r="5" fill="red"/></svg>`);

    const mousePosition = await mouse.getPosition();

    await sharp(file)
        .composite([{ input: cursor, top: mousePosition.y, left: mousePosition.x }])
        .toFile(file.replace(".jpg", "_cursor.jpg"));
};

export const screenshot = async (): Promise<string> => {
    if (helperSrc.IS_DEBUG) {
        await screen.capture("screenshot", FileType.JPG, `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}tmp/`);

        await drawCursor(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}tmp/screenshot.jpg`);
    }

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

    return imageBuffer.toString("base64");
};
