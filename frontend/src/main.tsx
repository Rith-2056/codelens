import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts: no request to a font service, and they work offline.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
