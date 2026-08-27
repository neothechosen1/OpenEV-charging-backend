import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { convexClient } from "./lib/client";
import { registerWebMcpTools } from "./webmcp";
import Home from "./pages/Home";
import Driver from "./pages/Driver";
import Session from "./pages/Session";
import Admin from "./pages/Admin";
import Tools from "./pages/Tools";
import "./index.css";

registerWebMcpTools(convexClient);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convexClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/c/:qrToken" element={<Driver />} />
          <Route path="/s/:sessionId" element={<Session />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/tools" element={<Tools />} />
        </Routes>
      </HashRouter>
    </ConvexProvider>
  </React.StrictMode>,
);
