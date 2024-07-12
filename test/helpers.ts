type FlatPromise<T> = T extends Promise<unknown> ? T : Promise<T>;

export const delayValue = <T>(value: T, delay = 0): FlatPromise<T> => {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), delay)
  ) as FlatPromise<T>;
};

export const delayFunction = <T, U>(
  callback: (...args: T[]) => U,
  delay = 0
): ((...args: T[]) => FlatPromise<U>) => {
  return (...args: T[]) => {
    const result = callback(...args);
    return delayValue(result, delay);
  };
};
