import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { registerVendorRoutes } from "./server/vendorRoutes.ts";
import { registerContractRoutes } from "./server/contractRoutes.ts";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  let apiKeyState: { lastTestedAt?: string; success?: boolean; model?: string; latencyMs?: number; message?: string } = {};

  app.use(express.json({ limit: "35mb" }));

  await registerVendorRoutes(app);
  await registerContractRoutes(app);

  app.post("/api/settings/api-key", (req, res) => {
    const apiKey = String(req.body.apiKey || '').trim();
    if (apiKey.length >= 20) {
      process.env.GEMINI_API_KEY = apiKey;
      res.json({ success: true, configured: true, message: "Gemini API key is active for this server session." });
    } else {
      res.status(400).json({ success: false, message: "Enter a valid Gemini API key." });
    }
  });

  app.get("/api/settings/api-key/status", (_req, res) => {
    res.json({ configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', ...apiKeyState });
  });

  app.post("/api/settings/api-key/test", async (req, res) => {
    const apiKey = String(req.body.apiKey || process.env.GEMINI_API_KEY || '').trim();
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (apiKey.length < 20) return res.status(400).json({ success: false, message: 'Enter a valid Gemini API key before testing.' });
    const startedAt = Date.now();
    try {
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model,
        contents: 'Reply with exactly: CONNECTION_OK',
        config: { maxOutputTokens: 32, temperature: 0 },
      });
      if (!String(result.text || '').includes('CONNECTION_OK')) throw new Error('The model returned an unexpected test response.');
      apiKeyState = { lastTestedAt: new Date().toISOString(), success: true, model, latencyMs: Date.now() - startedAt, message: 'Gemini connection verified.' };
      res.json(apiKeyState);
    } catch (error: any) {
      const raw = String(error?.message || 'Gemini rejected the connection test.');
      const message = /401|403|api key|permission|unauth/i.test(raw)
        ? 'Gemini rejected this key. Check that it is valid and has permission to use the selected model.'
        : /quota|429|rate/i.test(raw)
          ? 'The key was recognised, but its quota or rate limit prevented the test.'
          : 'Gemini could not complete the connection test. Check the key, model access and network connection.';
      apiKeyState = { lastTestedAt: new Date().toISOString(), success: false, model, latencyMs: Date.now() - startedAt, message };
      res.status(400).json(apiKeyState);
    }
  });

  // API routes FIRST
  app.post("/api/chat", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

      const ai = new GoogleGenAI({ apiKey });
      const { prompt, context } = req.body;

      const fullPrompt = context ? `Context:\n${context}\n\nUser Query:\n${prompt}` : prompt;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate response" });
    }
  });

  app.post("/api/generate-checklist", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

      const ai = new GoogleGenAI({ apiKey });
      const { categoryName } = req.body;

      const prompt = `
        You are an expert compliance and safety auditor in Malaysia.
        Generate a comprehensive inspection checklist for: "${categoryName}".
        The checklist should be practical and cover key safety, operational, and compliance aspects.
        Return ONLY a JSON array of strings, where each string is a checklist item.
        Example: ["Check oil levels", "Inspect safety harness", "Verify emergency stop button works"]
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("AI Checklist Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate checklist" });
    }
  });

  app.post("/api/compliance-task", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

      const ai = new GoogleGenAI({ apiKey });
      const { task } = req.body;

      const prompt = `
        You are an expert Fleet Management AI assistant for a company operating in Malaysia.
        The user needs to resolve the following compliance issue: "${task}".
        
        Based on standard Malaysian fleet regulations (e.g., involving JPJ, PUSPAKOM, DOSH, SPAD/APAD where relevant), provide a detailed breakdown and actionable task list to resolve this issue.
        Include:
        1. Required documents
        2. Authorities involved
        3. Step-by-step action plan
        
        Format the response in clean Markdown.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("AI Compliance Task Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate compliance tasks" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
