import {
  asyncReadable,
  get,
  enableStoreTestingMode,
  readable,
  asyncClient,
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
});
