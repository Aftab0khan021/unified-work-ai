import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// REMOVED <StrictMode> to prevent drag-and-drop crash
createRoot(document.getElementById("root")!).render(<App />);