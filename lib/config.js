// CONFIGURATION OPTIONS
let testingMode = false;
let anyStoreCreated = false;
export const flagStoreCreated = (override = true) => {
    anyStoreCreated = override;
};
export const getStoreTestingMode = () => testingMode;
export const enableStoreTestingMode = () => {
    if (anyStoreCreated) {
        throw new Error('Testing mode MUST be enabled before store creation');
    }
    testingMode = true;
};
let errorLogger;
export const logAsyncErrors = (logger) => {
    errorLogger = logger;
};
export const logError = (e) => {
    errorLogger === null || errorLogger === void 0 ? void 0 : errorLogger(e);
};
//# sourceMappingURL=config.js.map