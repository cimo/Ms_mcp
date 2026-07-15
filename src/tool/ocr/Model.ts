export interface IinstanceContext {
    cookie?: string;
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
