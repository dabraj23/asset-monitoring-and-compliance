export interface GeminiDiagnostic { message: string; providerStatus?: number }

/** Keep provider internals and API keys out of browser-visible error messages. */
export function classifyGeminiTestError(error: unknown, model: string): GeminiDiagnostic {
  const value = error as { status?: unknown; code?: unknown; message?: unknown; cause?: { code?: unknown } } | null;
  const status = Number(value?.status || value?.code);
  const providerStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
  const message = String(value?.message || '').toLowerCase();
  const causeCode = String(value?.cause?.code || '').toLowerCase();
  if (providerStatus === 401 || providerStatus === 403 || /invalid api key|api key not valid|permission denied|unauthenticated/.test(message)) {
    return { providerStatus, message: 'Gemini rejected this key or its model access. Check the API key and project permissions in Google AI Studio.' };
  }
  if (providerStatus === 429 || /quota exceeded|resource_exhausted|rate limit/.test(message)) {
    return { providerStatus: providerStatus || 429, message: 'Gemini received the request but returned HTTP 429: this project reached a quota or rate limit. Check its model limits and usage in Google AI Studio, then retry after the limit resets.' };
  }
  if (providerStatus === 404 || /model.*not found|not found.*model/.test(message)) {
    return { providerStatus, message: `Gemini model ${model} is unavailable to this project. Check model access or configure another supported model.` };
  }
  if (providerStatus === 503 || providerStatus === 500) {
    return { providerStatus, message: `Gemini returned HTTP ${providerStatus}. The provider may be temporarily unavailable; retry later.` };
  }
  if (/fetch failed|network|connect|timeout|timed out|econn|enotfound|etimedout|eai_again/.test(`${message} ${causeCode}`)) {
    return { message: 'The server could not reach Gemini. Check this laptop’s connection, DNS and firewall or proxy.' };
  }
  if (providerStatus) return { providerStatus, message: `Gemini rejected the test with HTTP ${providerStatus}. Check the selected model and project configuration.` };
  return { message: 'Gemini did not complete the test. Check the selected model and project status, then retry.' };
}
