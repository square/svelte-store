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

  describe("'in' operator", () => {
    it('correctly identifies the existence of own properties', () => {
      const myClient = asyncClient(writable<unknown>());

      expect('foo' in myClient).toBe(false);

      myClient.set({ foo: true });

      expect('foo' in myClient).toBe(true);
    });

    it('correctly identifies the existence of inherited properties', () => {
      const myClient = asyncClient(writable<unknown>());

      expect('foo' in myClient).toBe(false);
      expect('bar' in myClient).toBe(false);

      class MyClass {
        foo = true;
      }

      class MyChildClass extends MyClass {
        bar = true;
      }

      myClient.set(new MyChildClass());

      expect('foo' in myClient).toBe(true);
      expect('bar' in myClient).toBe(true);
    });
  });

  describe('Setting properties', () => {
    type MyClient = {
      foo: boolean;
      bar?: () => void;
    };

    it("'set' proxy handler", () => {
      const myMock = jest.fn();

      const myWritable = writable<MyClient>();

      const myClient = asyncClient(myWritable);

      myClient.set({ foo: true });

      myClient.bar = myMock;

      expect(Object.prototype.hasOwnProperty.call(myWritable, 'bar')).toBe(
        true
      );
      expect('bar' in myClient).toBe(true);

      myClient.bar();

      expect(myMock).toHaveBeenCalled();
    });

    it("'defineProperty' proxy handler", () => {
      const myMock = jest.fn();

      const myWritable = writable<MyClient>();

      const myClient = asyncClient(myWritable);

      myClient.set({ foo: true });

      Object.defineProperty(myClient, 'bar', { value: myMock });

      expect(Object.prototype.hasOwnProperty.call(myWritable, 'bar')).toBe(
        true
      );
      expect('bar' in myClient).toBe(true);

      myClient.bar();

      expect(myMock).toHaveBeenCalled();
    });
  });
});
