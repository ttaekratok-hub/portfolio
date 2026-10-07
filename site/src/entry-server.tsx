import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";

/** Renders the whole page to HTML at build time (see scripts/prerender.mjs). */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
