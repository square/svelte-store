import { flagStoreCreated } from '../src/config';
import {
  asyncReadable,
  get,
  derived,
  enableStoreTestingMode,
  readable,
  asyncClient,
  asyncWritable,
  asyncDerived,
  persisted,
  writable,
} from '../src/index';

enableStoreTestingMode();

const mockedFetch = jest.fn();
const myReadable = asyncReadable('initial', () => mockedFetch());

beforeEach(() => {
  myReadable.reset();
});

describe('can be reset for different tests', () => {
  it('loads resolution', async () => {
    mockedFetch.mockResolvedValueOnce('loaded');
    await myReadable.load();

    expect(get(myReadable)).toBe('loaded');

    mockedFetch.mockRejectedValueOnce('rejected');
    await myReadable.load();

    expect(get(myReadable)).toBe('loaded');
  });

  it('loads rejection', async () => {
    mockedFetch.mockRejectedValueOnce('rejected');
    await myReadable.load().catch(() => Promise.resolve());

    expect(get(myReadable)).toBe('initial');

    mockedFetch.mockResolvedValueOnce('loaded');
    await myReadable.load().catch(() => Promise.resolve());

    expect(get(myReadable)).toBe('initial');
  });
});

describe('asyncClient', () => {
  it('can spy on client properties', async () => {
    const myClient = asyncClient(readable({ myFunc: () => 'some string' }));
    const myFuncSpy = jest.spyOn(myClient, 'myFunc');

    expect(myFuncSpy).toHaveBeenCalledTimes(0);

    const result = await myClient.myFunc();

    expect(result).toBe('some string');
    expect(myFuncSpy).toHaveBeenCalledTimes(1);
  });

  it('can mock multiple async clients', () => {
    const clientA = asyncClient(
      readable<{ myFunc: () => string }>({ myFunc: () => 'clientA' })
    );
    const clientB = asyncClient(readable({ myFunc: () => 'clientB' }));

    const subscribe = jest.spyOn(clientA, 'subscribe');
    subscribe.mockImplementation((callbackFn) => {
      callbackFn({ myFunc: () => 'mockedA' });
      return jest.fn();
    });

    expect(get(clientA).myFunc()).toBe('mockedA');
    expect(get(clientB).myFunc()).toBe('clientB');
  });
});

describe('enableStoreTestingMode', () => {
  it('throws when store already created', () => {
    [
      asyncWritable,
      asyncDerived,
      asyncReadable,
      derived,
      writable,
      readable,
      persisted,
    ].forEach((store: CallableFunction) => {
      flagStoreCreated(false);
      store([], jest.fn);
      expect(() => enableStoreTestingMode()).toThrowError();
    });
  });
});
