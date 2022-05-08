import { asyncReadable, get, enableStoreTestingMode } from '../src/index';

enableStoreTestingMode();

const mockedFetch = jest.fn();
const myReadable = asyncReadable('initial', () => mockedFetch());

beforeEach(() => {
  myReadable.flagForReload();
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
