// CONFIGURATION OPTIONS

let testingMode = false;

let anyStoreCreated = false;

export const flagStoreCreated = (override = true): void => {
  anyStoreCreated = override;
};

export const getStoreTestingMode = (): boolean => testingMode;

export const enableStoreTestingMode = (): void => {
  if (anyStoreCreated) {
    throw new Error('Testing mode MUST be enabled before store creation');
  }
  testingMode = true;
};

type ErrorLogger = (e: Error) => void;
let errorLogger: ErrorLogger;

export const logAsyncErrors = (logger: ErrorLogger): void => {
  errorLogger = logger;
};

export const logError = (e: Error): void => {
  errorLogger?.(e);
};
