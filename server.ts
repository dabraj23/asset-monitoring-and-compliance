import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { registerVendorRoutes } from "./server/vendorRoutes.ts";
import { registerContractRoutes } from "./server/contractRoutes.ts";
import { registerAuthRoutes, registerUserRoutes, requireAuth, requireGroupAdmin } from "./server/platformAuth.ts";
import { entityAccess } from './server/entityAccess.ts';
import { registerWorkflowRoutes } from './server/workflowRoutes.ts';
import { registerAssetRoutes } from './server/assetRoutes.ts';
import { generateReminderOutbox, registerWorkRoutes } from './server/workRoutes.ts';
import { registerExecutiveRoutes } from './server/executiveRoutes.ts';
import { registerIntakeRoutes, resumeIntakeJobs } from './server/intakeRoutes.ts';
import { registerAssetDocumentRoutes, resumeAssetDocumentJobs } from './server/assetDocumentRoutes.ts';
import { registerH2HRoutes } from './server/h2hRoutes.ts';
import { startSftpIntegration } from './server/sftpIntegration.ts';
import { geminiKeySource, loadGeminiKey, saveGeminiKey } from './server/aiKeyStore.ts';
import { classifyGeminiTestError } from './server/geminiDiagnostics.ts';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT) || 3000;
  let apiKeyState: { lastTestedAt?: string; success?: boolean; model?: string; latencyMs?: number; providerStatus?: number; message?: string } = {};

  app.use(express.json({ limit: "35mb" }));
  app.use(express.text({ type: ['text/csv', 'application/csv'], limit: '5mb' }));
  await loadGeminiKey();

  await registerAuthRoutes(app);
  registerH2HRoutes(app);
  app.use('/api', requireAuth);
  app.use('/api', entityAccess);
  registerUserRoutes(app);
  registerWorkflowRoutes(app);
  registerAssetRoutes(app);
  registerWorkRoutes(app);
  registerExecutiveRoutes(app);
  registerIntakeRoutes(app);
  registerAssetDocumentRoutes(app);

  await registerVendorRoutes(app);
  await registerContractRoutes(app);
  void resumeIntakeJobs().catch(error => console.error('CSV job recovery failed:', error));
  void resumeAssetDocumentJobs().catch(error => console.error('Asset document job recovery failed:', error));
  startSftpIntegration();
  void generateReminderOutbox().catch(error => console.error('Reminder generation failed:', error));
  setInterval(() => { void generateReminderOutbox().catch(error => console.error('Reminder generation failed:', error)); }, 60 * 60 * 1000).unref();

  app.post("/api/settings/api-key", requireGroupAdmin, async (req, res) => {
    const apiKey = String(req.body.apiKey || '').trim();
    try { await saveGeminiKey(apiKey); apiKeyState = {}; res.json({ success: true, configured: true, source: geminiKeySource(), message: 'Key saved for this laptop pilot. Test the connection next.' }); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Could not save this key.' }); }
  });

  app.get("/api/settings/api-key/status", (_req, res) => {
    res.json({ configured: Boolean(process.env.GEMINI_API_KEY), source: geminiKeySource(), model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', ...apiKeyState });
  });

  app.post("/api/settings/api-key/test", requireGroupAdmin, async (req, res) => {
    const apiKey = String(req.body?.apiKey || process.env.GEMINI_API_KEY || '').trim();
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (apiKey.length < 20) return res.status(400).json({ success: false, configured: false, message: 'Enter and save a Gemini key before testing.' });
    const startedAt = Date.now();
    try {
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model,
        contents: 'Reply with one short word: OK',
        config: { maxOutputTokens: 64, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      });
      if (!String(result.text || '').trim()) throw new Error('The model returned no text. Try another accessible model or retry later.');
      apiKeyState = { lastTestedAt: new Date().toISOString(), success: true, model, latencyMs: Date.now() - startedAt, message: 'Gemini connection verified.' };
      res.json(apiKeyState);
    } catch (error: unknown) {
      const diagnostic = classifyGeminiTestError(error, model);
      apiKeyState = { lastTestedAt: new Date().toISOString(), success: false, model, latencyMs: Date.now() - startedAt, ...diagnostic };
      res.status(400).json({ ...apiKeyState, configured: Boolean(process.env.GEMINI_API_KEY), source: geminiKeySource() });
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
      configLoader: 'runner',
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

  app.listen(PORT, process.env.HOST || '127.0.0.1', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
