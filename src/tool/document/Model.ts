export interface Idocument {
    fileName: string;
    markdown: string;
}

export interface IdocumentParser {
    documentList: Idocument[];
    message: string;
}
