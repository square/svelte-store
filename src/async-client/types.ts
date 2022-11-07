export type AsyncClient<T> = T extends (...args: infer TArgs) => infer TReturn
  ? (...args: TArgs) => Promise<TReturn>
  : {
      [k in keyof T]: T[k] extends (...args: infer KArgs) => infer KReturn // callable property?
        ? (...args: KArgs) => Promise<KReturn> // make the function async
        : () => Promise<T[k]>; // return the property in a Promise
    };
