import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeError, isActivationError, sha256Hex, zhixi, ZhixiApiError } from "./client";
import type { AccountStatus, SyncChange } from "./types";

describe("sha256Hex", () => {
  it("与已知摘要一致（网关 /v2/translate 的 sourceHash 契约）", async () => {
    expect(await sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("ZhixiApiError.userMessage", () => {
  it("按额度范围给出可执行提示", () => {
    expect(new ZhixiApiError("", 429, "quota_exceeded", "ai_packs").userMessage).toContain("AI 学习包");
    expect(new ZhixiApiError("", 429, "quota_exceeded", "audio_seconds").userMessage).toContain("音频");
    expect(new ZhixiApiError("", 429, "quota_exceeded", "text").userMessage).toContain("翻译");
    expect(new ZhixiApiError("", 403, "account_required").userMessage).toContain("激活");
    // 网页版不再把未开卡用户指向 App / 管理员，而是指向本页自助申请。
    expect(new ZhixiApiError("", 404, "account_not_found").userMessage).toContain("申请试用");
  });

  it("设备上限提示包含上限数字", () => {
    const error = new ZhixiApiError("", 403, "device_limit_reached", null, 3);
    expect(error.userMessage).toContain("3 台");
  });

  it("两步激活相关错误码给出可执行提示", () => {
    expect(new ZhixiApiError("", 503, "sms_not_configured").userMessage).toContain("短信服务未配置");
    expect(new ZhixiApiError("", 429, "cooldown").userMessage).toContain("频繁");
    expect(new ZhixiApiError("", 429, "too_many_attempts").userMessage).toContain("重新获取");
    // code_mismatch：无 detail 时兜底提示；有 detail（含剩余次数）时原样透传。
    expect(new ZhixiApiError("", 400, "code_mismatch").userMessage).toContain("验证码不正确");
    expect(new ZhixiApiError("验证码不正确，还可尝试 4 次", 400, "code_mismatch").userMessage).toBe(
      "验证码不正确，还可尝试 4 次",
    );
    expect(new ZhixiApiError("", 403, "activation_code_required").userMessage).toContain("验证码");
  });
});

// ---------- 请求体与错误头解析（mock fetch） ----------

const GATEWAY = "https://gateway.test";
const store = new Map<string, string>();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const calls: { url: string; init: RequestInit }[] = [];

function mockFetch(handler: (url: string) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      return handler(url);
    }),
  );
}

beforeEach(() => {
  store.clear();
  calls.length = 0;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  });
  store.set("zhixi.web.gateway", GATEWAY);
  // 预置设备凭据，避免测试触发 /v1/devices/register。
  store.set("zhixi.web.device", JSON.stringify({ deviceId: "device-1", token: "token-1" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACCOUNT_STATUS: AccountStatus = {
  activated: true,
  required: true,
  status: "active",
  phoneMasked: "139****0997",
  displayName: "试用用户",
  validUntil: "2026-12-31",
  limits: { aiPacksPerDay: 5, audioMinutesPerDay: 60, textCharactersPerDay: 50000, documentsPerDay: 10, maxDevices: 2 },
  usage: { date: "2026-11-01", aiPacks: 0, audioMinutes: 0, textCharacters: 0, documents: 0 },
};

describe("requestActivationCode（两步激活第 1 步）", () => {
  it("POST {phone} 并携带设备 Bearer，解析 sent/phoneMasked/cooldownSeconds", async () => {
    mockFetch((url) => {
      expect(url).toBe(`${GATEWAY}/v1/accounts/activate/request-code`);
      return jsonResponse({ sent: true, phoneMasked: "139****0997", cooldownSeconds: 60 });
    });
    const result = await zhixi.requestActivationCode("13800001234");
    expect(result).toEqual({ sent: true, phoneMasked: "139****0997", cooldownSeconds: 60 });
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ phone: "13800001234" });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("429 cooldown（读 X-Zhixi-Error-Code）映射为频繁提示", async () => {
    mockFetch(() =>
      jsonResponse({ detail: "发送过于频繁" }, { status: 429, headers: { "X-Zhixi-Error-Code": "cooldown" } }),
    );
    const error = await zhixi.requestActivationCode("13800001234").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZhixiApiError);
    expect((error as ZhixiApiError).status).toBe(429);
    expect((error as ZhixiApiError).code).toBe("cooldown");
    expect((error as ZhixiApiError).userMessage).toContain("频繁");
  });

  it("503 sms_not_configured 明确失败，不给出可用验证码", async () => {
    mockFetch(() =>
      jsonResponse({ detail: "短信服务未配置" }, { status: 503, headers: { "X-Zhixi-Error-Code": "sms_not_configured" } }),
    );
    const error = await zhixi.requestActivationCode("13800001234").catch((e: unknown) => e);
    expect((error as ZhixiApiError).code).toBe("sms_not_configured");
    expect((error as ZhixiApiError).userMessage).toContain("短信服务未配置");
  });
});

describe("activateAccountWithCode（两步激活第 2 步）", () => {
  it("POST {phone, code} 并返回 AccountStatus", async () => {
    mockFetch((url) => {
      expect(url).toBe(`${GATEWAY}/v1/accounts/activate`);
      return jsonResponse(ACCOUNT_STATUS);
    });
    const status = await zhixi.activateAccountWithCode("13800001234", "123456");
    expect(status.activated).toBe(true);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ phone: "13800001234", code: "123456" });
  });

  it("400 code_mismatch：detail 中文（含剩余次数）透传为用户提示", async () => {
    mockFetch(() =>
      jsonResponse({ detail: "验证码不正确，还可尝试 4 次" }, { status: 400, headers: { "X-Zhixi-Error-Code": "code_mismatch" } }),
    );
    const error = await zhixi.activateAccountWithCode("13800001234", "000000").catch((e: unknown) => e);
    expect((error as ZhixiApiError).code).toBe("code_mismatch");
    expect((error as ZhixiApiError).userMessage).toBe("验证码不正确，还可尝试 4 次");
  });
});

describe("自助申请试用（网页版独立可用）", () => {
  it("requestTrialCode POST {phone} 并解析冷却时间", async () => {
    mockFetch((url) => {
      expect(url).toBe(`${GATEWAY}/v1/trial/request-code`);
      return jsonResponse({
        sent: true,
        phoneMasked: "139****0997",
        expiresInSeconds: 300,
        resendAfterSeconds: 60,
      });
    });
    const result = await zhixi.requestTrialCode("13800001234");
    expect(result.resendAfterSeconds).toBe(60);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ phone: "13800001234" });
  });

  it("applyTrial 携带设备 Bearer，返回 deviceBound 供 UI 判断是否需要二次验证", async () => {
    mockFetch((url) => {
      expect(url).toBe(`${GATEWAY}/v1/trial/apply`);
      return jsonResponse(
        {
          applied: true,
          phoneMasked: "139****0997",
          validUntil: "2027-01-02",
          limits: {
            aiPacksPerDay: 5,
            audioMinutesPerDay: 30,
            textCharactersPerDay: 20000,
            documentsPerDay: 5,
            maxDevices: 3,
          },
          message: "申请成功，已开通试用额度",
          deviceBound: true,
        },
        { status: 201 },
      );
    });
    const applied = await zhixi.applyTrial({
      phone: "13800001234",
      code: "123456",
      name: "张三",
      nickname: "小张",
      consent: true,
    });
    expect(applied.deviceBound).toBe(true);
    expect(applied.validUntil).toBe("2027-01-02");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-1");
  });

  it("409 phone_registered 映射到 isActivationError 之外的独立错误码", async () => {
    mockFetch(() =>
      jsonResponse(
        { detail: "该手机号已在试用名单中" },
        { status: 409, headers: { "X-Zhixi-Error-Code": "phone_registered" } },
      ),
    );
    const error = await zhixi.requestTrialCode("13800001234").catch((e: unknown) => e);
    expect((error as ZhixiApiError).code).toBe("phone_registered");
    expect(isActivationError(error)).toBe(false);
  });

  it("describeError/isActivationError 区分激活类错误与其它错误", () => {
    expect(isActivationError(new ZhixiApiError("", 403, "account_required"))).toBe(true);
    expect(isActivationError(new ZhixiApiError("", 404, "account_not_found"))).toBe(true);
    expect(isActivationError(new Error("boom"))).toBe(false);
    expect(describeError(new ZhixiApiError("原文", 403, "account_required"))).toContain("设置");
  });
});

describe("云空间同步接口", () => {
  const change: SyncChange = {
    entity: "courses",
    clientUid: "0b8f6c0e-6a55-4b58-8d9e-8c9f7a2b1c3d",
    payload: { name: "市场营销导论", createdAtMillis: 1000 },
    updatedAt: 1000,
    deleted: false,
  };

  it("syncPush POST {changes} 并解析 results/serverTime", async () => {
    mockFetch((url) => {
      expect(url).toBe(`${GATEWAY}/v1/sync/push`);
      return jsonResponse({ results: [{ clientUid: change.clientUid, status: "accepted" }], serverTime: 2000 });
    });
    const response = await zhixi.syncPush([change]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ changes: [change] });
    expect(response.results[0].status).toBe("accepted");
    expect(response.serverTime).toBe(2000);
  });

  it("syncPull POST {entities:[]}（空数组=全部）并解析 records", async () => {
    mockFetch((url) => {
      expect(url).toBe(`${GATEWAY}/v1/sync/pull`);
      return jsonResponse({
        records: [{ entity: "courses", clientUid: change.clientUid, payload: change.payload, updatedAt: 1000, deleted: false }],
        serverTime: 3000,
      });
    });
    const response = await zhixi.syncPull([]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ entities: [] });
    expect(response.records).toHaveLength(1);
    expect(response.records[0].entity).toBe("courses");
    expect(response.records[0].payload).toEqual({ name: "市场营销导论", createdAtMillis: 1000 });
  });
});
