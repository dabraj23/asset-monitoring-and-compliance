import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/settings/api-key", (req, res) => {
    const { apiKey } = req.body;
    if (apiKey) {
      process.env.GEMINI_API_KEY = apiKey;
      res.json({ success: true, message: "API Key updated successfully" });
    } else {
      res.status(400).json({ success: false, message: "API Key is required" });
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
