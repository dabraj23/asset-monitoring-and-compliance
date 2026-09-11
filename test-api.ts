import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'Generate a JSON array of 3 strings. ONLY return the JSON array.',
    });
    console.log("Response:", response.text);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
