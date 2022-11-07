import { asyncClient, readable, writable } from '../../src';

describe('asyncClient', () => {
  it('allows access of store value functions', async () => {
    const myClient = asyncClient(readable({ add1: (num: number) => num + 1 }));
    const result = await myClient.add1(1);
    expect(result).toBe(2);
  });

  it('allows access of store value functions before loading', async () => {
    const myClient = asyncClient(writable<{ add1: (num: number) => number }>());
    const resultPromise = myClient.add1(1);
    myClient.set({ add1: (num: number) => num + 1 });
    const result = await resultPromise;
    expect(result).toBe(2);
  });

  it('allows access of non-function store value properties', async () => {
    const myClient = asyncClient(writable<{ foo: string }>());
    const resultPromise = myClient.foo();
    myClient.set({ foo: 'bar' });
    const result = await resultPromise;
    expect(result).toBe('bar');
  });

  it('allows invocation of function stores', async () => {
    const myClient = asyncClient(writable<(input: string) => string>());
    const resultPromise = myClient('input');
    myClient.set((input: string) => `${input} + output`);
    const result = await resultPromise;
    expect(result).toBe('input + output');
  });
});
