import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { applyAuthChoiceLocal } from "./auth-choice.apply.local.js";

const promptCustomApiConfig = vi.hoisted(() => vi.fn());

vi.mock("./onboard-custom.js", () => ({
  promptCustomApiConfig,
}));

function createPrompter(params?: {
  noteSpy?: ReturnType<typeof vi.fn>;
  selectSpy?: ReturnType<typeof vi.fn>;
}): WizardPrompter {
  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note: params?.noteSpy ?? vi.fn(async () => {}),
    select: params?.selectSpy ?? vi.fn(async () => "continue"),
    multiselect: vi.fn(async () => []),
    text: vi.fn(async () => ""),
    confirm: vi.fn(async () => false),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
  };
}

function createRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    }),
  };
}

describe("applyAuthChoiceLocal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    promptCustomApiConfig.mockReset();
  });

  it("shows endpoint-down guidance for local runtime", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("connect ECONNREFUSED"))),
    );
    promptCustomApiConfig.mockResolvedValue({ config: {} });
    const note = vi.fn(async () => {});

    await applyAuthChoiceLocal({
      authChoice: "ollama-local",
      config: {},
      prompter: createPrompter({ noteSpy: note }),
      runtime: createRuntime(),
      setDefaultModel: true,
    });

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't reach Ollama"),
      "Ollama preflight",
    );
  });

  it("shows model-missing guidance when model is not listed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [{ id: "not-the-default" }],
        }),
      ),
    );
    promptCustomApiConfig.mockResolvedValue({ config: {} });
    const note = vi.fn(async () => {});

    await applyAuthChoiceLocal({
      authChoice: "lm-studio-local",
      config: {},
      prompter: createPrompter({ noteSpy: note }),
      runtime: createRuntime(),
      setDefaultModel: true,
    });

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining('model "local-model" is not listed'),
      "LM Studio preflight",
    );
  });

  it("retries preflight when user selects retry", async () => {
    let fetchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          throw new Error("connect ECONNREFUSED");
        }
        return Response.json({ data: [{ id: "llama3.3" }] });
      }),
    );
    promptCustomApiConfig.mockResolvedValue({ config: {} });
    const select = vi.fn(async () => "retry");

    await applyAuthChoiceLocal({
      authChoice: "ollama-local",
      config: {},
      prompter: createPrompter({ selectSpy: select }),
      runtime: createRuntime(),
      setDefaultModel: true,
    });

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Ollama preflight check" }),
    );
    expect(fetchCalls).toBe(2);
  });
});
