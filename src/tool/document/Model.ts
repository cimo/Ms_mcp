import { Rect } from "mupdf";

export interface IinstanceContext {
    cookie?: string;
}

interface IstructuredTextLine {
    wmode: 0 | 1;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    font: {
        name: string;
        family: "serif" | "sans-serif" | "monospace";
        weight: "normal" | "bold";
        style: "normal" | "italic";
        size: number;
    };
    x: number;
    y: number;
    text: string;
}

interface IstructuredTextBlock {
    type: "image" | "text";
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    lines: IstructuredTextLine[];
}

export interface IstructuredTextPage {
    blocks: IstructuredTextBlock[];
}

export interface IjsonDocumentPage {
    pageNumber: number;
    content: IstructuredTextPage;
}

export interface IjsonDocument {
    pageCount: number;
    pageList: IjsonDocumentPage[];
}

export interface IwordInfo {
    pageNumber: number;
    token: string;
    wordPartList: string[];
    word: string;
    rect: Rect;
}

export interface IpageRectList {
    pageNumber: number;
    rectList: Rect[];
}
