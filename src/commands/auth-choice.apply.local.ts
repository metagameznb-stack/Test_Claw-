import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { fetchWithTimeout } from "../utils/fetch-timeout.js";
import { promptCustomApiConfig } from "./onboard-custom.js";

const OLLAMA_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
const OLLAMA_LOCAL_DEFAULT_MODEL = "llama3.3";
const LM_STUDIO_LOCAL_BASE_URL = "http://127.0.0.1:1234/v1";
const LM_STUDIO_DEFAULT_MODEL = "local-model";
const PREFLIGHT_TIMEOUT_MS = 3500;

type LocalPreset = {
  isOllama: boolean;
  localName: "Ollama" | "LM Studio";
  baseUrl: string;
  modelId: string;
  providerId: string;
  alias: string;
};

type LocalPreflightResult =
  | { ok: true }
  | { ok: false; reason: "endpoint-down" }
  | { ok: false; reason: "model-missing" };

function buildLocalPreset(authChoice: "ollama-local" | "lm-studio-local"): LocalPreset {
  const isOllama = authChoice === "ollama-local";
  return {
    isOllama,
    localName: isOllama ? "Ollama" : "LM Studio",
    baseUrl: isOllama ? OLLAMA_LOCAL_BASE_URL : LM_STUDIO_LOCAL_BASE_URL,
    modelId: isOllama ? OLLAMA_LOCAL_DEFAULT_MODEL : LM_STUDIO_DEFAULT_MODEL,
    providerId: isOllama ? "ollama" : "lmstudio",
    alias: isOllama ? "ollama" : "lmstudio",
  };
}

function parseModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const maybeData = (payload as { data?: unknown }).data;
  if (!Array.isArray(maybeData)) {
    return [];
  }
  return maybeData
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const id = (entry as { id?: unknown }).id;
      return typeof id === "string" ? id.trim() : "";
    })
    .filter(Boolean);
}

async function runLocalPreflight(params: {
  baseUrl: string;
  expectedModel: string;
}): Promise<LocalPreflightResult> {
  try {
    const endpoint = new URL(
      "models",
      params.baseUrl.endsWith("/") ? params.baseUrl : `${params.baseUrl}/`,
    ).href;
    const response = await fetchWithTimeout(endpoint, { method: "GET" }, PREFLIGHT_TIMEOUT_MS);
    if (!response.ok) {
      return { ok: false, reason: "endpoint-down" };
    }
    const json: unknown = await response.json().catch(() => null);
    const ids = parseModelIds(json);
    if (ids.length > 0 && !ids.includes(params.expectedModel)) {
      return { ok: false, reason: "model-missing" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "endpoint-down" };
  }
}

async function noteLocalSetup(params: ApplyAuthChoiceParams, preset: LocalPreset) {
  const localSetupHint = preset.isOllama
    ? [
        "Local setup tips:",
        "- Install/start Ollama and run `ollama pull llama3.3`.",
        `- OpenClaw will connect to ${preset.baseUrl}.`,
      ].join("\n")
    : [
        "Local setup tips:",
        "- Start LM Studio local server mode and load a model.",
        `- OpenClaw will connect to ${preset.baseUrl}.`,
      ].join("\n");

  await params.prompter.note(localSetupHint, `${preset.localName} local setup`);
}

async function notePreflightHint(
  params: ApplyAuthChoiceParams,
  preset: LocalPreset,
  reason: "endpoint-down" | "model-missing",
) {
  if (reason === "endpoint-down") {
    const hint = preset.isOllama
      ? [
          `Couldn't reach ${preset.localName} at ${preset.baseUrl}.`,
          "Start Ollama (`ollama serve`) and retry.",
          "If this is your first run, pull a model first: `ollama pull llama3.3`.",
        ].join("\n")
      : [
          `Couldn't reach ${preset.localName} at ${preset.baseUrl}.`,
          "Start LM Studio local server mode on port 1234 and retry.",
          "Then load a model and confirm `/v1/models` returns entries.",
        ].join("\n");
    await params.prompter.note(hint, `${preset.localName} preflight`);
    return;
  }

  const modelHint = preset.isOllama
    ? [
        `Connected to ${preset.localName}, but model "${preset.modelId}" is not listed.`,
        `Run: ollama pull ${preset.modelId}`,
        "You can still continue and pick a different model ID in the next step.",
      ].join("\n")
    : [
        `Connected to ${preset.localName}, but model "${preset.modelId}" is not listed.`,
        "Load/select a model in LM Studio local server mode.",
        "You can still continue and pick a different model ID in the next step.",
      ].join("\n");
  await params.prompter.note(modelHint, `${preset.localName} preflight`);
}

async function resolveLocalPreflight(params: ApplyAuthChoiceParams, preset: LocalPreset) {
  let preflight = await runLocalPreflight({
    baseUrl: preset.baseUrl,
    expectedModel: preset.modelId,
  });

  while (!preflight.ok) {
    await notePreflightHint(params, preset, preflight.reason);
    const nextStep = await params.prompter.select({
      message: `${preset.localName} preflight check`,
      options: [
        {
          value: "retry",
          label: "Retry preflight",
          hint: "Re-check endpoint + model before continuing",
        },
        {
          value: "continue",
          label: "Continue setup anyway",
          hint: "Use custom provider prompts to adjust model/base URL",
        },
      ],
      initialValue: "retry",
    });

    if (nextStep !== "retry") {
      return;
    }

    preflight = await runLocalPreflight({
      baseUrl: preset.baseUrl,
      expectedModel: preset.modelId,
    });
  }
}

export async function applyAuthChoiceLocal(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "ollama-local" && params.authChoice !== "lm-studio-local") {
    return null;
  }

  const preset = buildLocalPreset(params.authChoice);
  await noteLocalSetup(params, preset);
  await resolveLocalPreflight(params, preset);

  const result = await promptCustomApiConfig({
    prompter: params.prompter,
    runtime: params.runtime,
    config: params.config,
    initialBaseUrl: preset.baseUrl,
    initialModelId: preset.modelId,
    initialProviderId: preset.providerId,
    initialAlias: preset.alias,
    compatibilityChoice: "openai",
    skipCompatibilityPrompt: true,
  });

  return { config: result.config };
}
