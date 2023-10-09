var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { derived as vanillaDerived, get, writable as vanillaWritable, } from 'svelte/store';
import { anyReloadable, loadAll, reloadAll } from '../utils/index.js';
import { flagStoreCreated } from '../config.js';
const loadDependencies = (thisStore, loadFunction, stores) => __awaiter(void 0, void 0, void 0, function* () {
    // Create a dummy subscription when we load the store.
    // This ensures that we will have at least one subscriber when
    // loading the store so that our start function will run.
    const dummyUnsubscribe = thisStore.subscribe(() => {
        /* no-op */
    });
    try {
        yield loadFunction(stores);
    }
    catch (error) {
        dummyUnsubscribe();
        throw error;
    }
    dummyUnsubscribe();
    return get(thisStore);
});
// eslint-disable-next-line func-style
export function derived(stores, fn, initialValue) {
    flagStoreCreated();
    const thisStore = vanillaDerived(stores, fn, initialValue);
    const load = () => loadDependencies(thisStore, loadAll, stores);
    const reload = anyReloadable(stores)
        ? (visitedMap) => {
            const visitMap = visitedMap !== null && visitedMap !== void 0 ? visitedMap : new WeakMap();
            const reloadAndTrackVisits = (stores) => reloadAll(stores, visitMap);
            return loadDependencies(thisStore, reloadAndTrackVisits, stores);
        }
        : undefined;
    return Object.assign(Object.assign(Object.assign({ get store() {
            return this;
        } }, thisStore), { load }), (reload && { reload }));
}
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
export const writable = (value, start) => {
    flagStoreCreated();
    let hasEverLoaded = false;
    let resolveLoadPromise;
    let loadPromise = new Promise((resolve) => {
        resolveLoadPromise = (value) => {
            hasEverLoaded = true;
            resolve(value);
        };
    });
    const updateLoadPromise = (value) => {
        if (value === undefined && !hasEverLoaded) {
            // don't resolve until we get a defined value
            return;
        }
        resolveLoadPromise(value);
        loadPromise = Promise.resolve(value);
    };
    const startFunction = (set, update) => {
        const customSet = (value) => {
            set(value);
            updateLoadPromise(value);
        };
        const customUpdate = (fn) => {
            update(fn);
        };
        // intercept the `set` function being passed to the provided start function
        // instead provide our own `set` which also updates the load promise.
        return start(customSet, customUpdate);
    };
    const thisStore = vanillaWritable(value, start && startFunction);
    const load = () => __awaiter(void 0, void 0, void 0, function* () {
        // Create a dummy subscription when we load the store.
        // This ensures that we will have at least one subscriber when
        // loading the store so that our start function will run.
        const dummyUnsubscribe = thisStore.subscribe(() => {
            /* no-op */
        });
        let loadedValue;
        try {
            loadedValue = yield loadPromise;
        }
        catch (error) {
            dummyUnsubscribe();
            throw error;
        }
        dummyUnsubscribe();
        return loadedValue;
    });
    if (value !== undefined) {
        // immeadietly load stores that are given an initial value
        updateLoadPromise(value);
    }
    const set = (value) => {
        thisStore.set(value);
        updateLoadPromise(value);
    };
    const update = (updater) => {
        const newValue = updater(get(thisStore));
        thisStore.set(newValue);
        updateLoadPromise(newValue);
    };
    return Object.assign(Object.assign({ get store() {
            return this;
        } }, thisStore), { set,
        update,
        load });
};
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
export const readable = (value, start) => {
    const { subscribe, load } = writable(value, start);
    return {
        subscribe,
        load,
        get store() {
            return this;
        },
    };
};
//# sourceMappingURL=index.js.map