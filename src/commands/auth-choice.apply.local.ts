import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { promptCustomApiConfig } from "./onboard-custom.js";

const OLLAMA_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
const OLLAMA_LOCAL_DEFAULT_MODEL = "llama3.3";
const LM_STUDIO_LOCAL_BASE_URL = "http://127.0.0.1:1234/v1";
const LM_STUDIO_DEFAULT_MODEL = "local-model";

export async function applyAuthChoiceLocal(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "ollama-local" && params.authChoice !== "lm-studio-local") {
    return null;
  }

  const isOllama = params.authChoice === "ollama-local";
  const localName = isOllama ? "Ollama" : "LM Studio";
  const localSetupHint = isOllama
    ? [
        "Local setup tips:",
        "- Install/start Ollama and run `ollama pull llama3.3`.",
        `- OpenClaw will connect to ${OLLAMA_LOCAL_BASE_URL}.`,
      ].join("\n")
    : [
        "Local setup tips:",
        "- Start LM Studio local server mode.",
        `- OpenClaw will connect to ${LM_STUDIO_LOCAL_BASE_URL}.`,
      ].join("\n");

  await params.prompter.note(localSetupHint, `${localName} local setup`);

  const result = await promptCustomApiConfig({
    prompter: params.prompter,
    runtime: params.runtime,
    config: params.config,
    initialBaseUrl: isOllama ? OLLAMA_LOCAL_BASE_URL : LM_STUDIO_LOCAL_BASE_URL,
    initialModelId: isOllama ? OLLAMA_LOCAL_DEFAULT_MODEL : LM_STUDIO_DEFAULT_MODEL,
    initialProviderId: isOllama ? "ollama" : "lmstudio",
    initialAlias: isOllama ? "ollama" : "lmstudio",
    compatibilityChoice: "openai",
    skipCompatibilityPrompt: true,
  });

  return { config: result.config };
}
