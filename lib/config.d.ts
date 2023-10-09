export declare const flagStoreCreated: (override?: boolean) => void;
export declare const getStoreTestingMode: () => boolean;
export declare const enableStoreTestingMode: () => void;
declare type ErrorLogger = (e: Error) => void;
export declare const logAsyncErrors: (logger: ErrorLogger) => void;
export declare const logError: (e: Error) => void;
export {};
