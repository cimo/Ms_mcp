declare namespace JSX {
    interface IntrinsicElements {
        [elemName: string]: unknown;
    }
}

declare module "sharp" {
    export type Channels = 1 | 2 | 3 | 4;

    export interface RawInputOptions {
        width: number;
        height: number;
        channels: Channels;
    }

    export interface SharpOptions {
        raw?: RawInputOptions;
    }

    export interface CompositeItem {
        input: Buffer;
        top: number;
        left: number;
    }

    export interface OutputInfo {
        format: string;
        width: number;
        height: number;
        channels: Channels;
        size: number;
    }

    export interface SharpInstance {
        composite(images: readonly CompositeItem[]): SharpInstance;
        toFile(path: string): Promise<OutputInfo>;
        jpeg(): SharpInstance;
        removeAlpha(): SharpInstance;
        toBuffer(): Promise<Buffer>;
    }

    export default function sharp(input?: Buffer | Uint8Array, options?: SharpOptions): SharpInstance;
}
