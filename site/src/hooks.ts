// Small custom hooks shared by components. A custom hook is a function whose
// name starts with `use` and that calls other hooks; React's rules of hooks
// apply to it (call it at the top level of a component, never in a condition).
//
// Both are built on useSyncExternalStore, React's hook for reading a value that
// lives outside React (here: "are we in a browser?" and the visitor's system
// settings). It takes three functions:
//   subscribe(onChange)  start listening for changes; return a function that
//                        stops listening
//   getSnapshot()        the current value in the browser
//   getServerSnapshot()  the value while pre-rendering and while hydrating
// Because the server value is also used during hydration, the first browser
// render matches the pre-rendered HTML exactly; React then re-renders with the
// real browser value. That's what makes these hydration-safe.
// Learn more: https://react.dev/reference/react/useSyncExternalStore
import { useSyncExternalStore } from "react";

// Being in the browser never changes, so there's nothing to listen to. Defined
// outside any component so it's the same function on every render; a new one
// each time would make React unsubscribe and subscribe again.
const noSubscription = () => () => {};

/**
 * false while pre-rendering and hydrating, true once running in the browser.
 * In a plain client render with nothing to hydrate (createRoot, as in the
 * tests) it's true from the start, which the useState-plus-useEffect version
 * of this can't do.
 */
export function useIsBrowser(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * Whether a CSS media query matches, kept up to date live: if the visitor turns
 * on Reduce Motion while the page is open, components re-render right away.
 * Always false while pre-rendering (there's no screen to ask).
 *
 * Example: const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      // matchMedia evaluates a media query from JavaScript; its "change" event
      // fires when the answer flips. jsdom (the test DOM) has no matchMedia.
      const list = window.matchMedia?.(query);
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
