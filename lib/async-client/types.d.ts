export declare type AsyncClient<T> = T extends (...args: infer TArgs) => infer TReturn ? (...args: TArgs) => Promise<TReturn> : {
    [k in keyof T]: T[k] extends (...args: infer KArgs) => infer KReturn ? (...args: KArgs) => Promise<KReturn> : () => Promise<T[k]>;
};
