export interface IinstanceContext {
    cookie?: string;
}

export interface ItoolOcrResponse {
    id: number;
    polygon: number[][];
    text: string;
    isMatch: boolean;
}

export interface ItoolOcrResult {
    id: number;
    text: string;
    centerPoint: {
        x: number;
        y: number;
    };
    isMatch: boolean;
}
