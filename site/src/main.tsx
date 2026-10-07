import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// In production the HTML is already there (pre-rendered at build time), so
// React "hydrates" it: attaches event handlers instead of redrawing. During
// `npm run dev` there's no pre-rendered HTML, so it renders from scratch.
if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
