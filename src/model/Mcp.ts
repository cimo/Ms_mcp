export interface ItoolTask {
    stepList: [
        {
            action: string;
            argumentObject: Record<string, string>;
        }
    ];
}
