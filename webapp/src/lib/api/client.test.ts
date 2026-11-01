import { describe, expect, it } from "vitest";
import { sha256Hex, ZhixiApiError } from "./client";

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
    expect(new ZhixiApiError("", 404, "account_not_found").userMessage).toContain("管理员");
  });

  it("设备上限提示包含上限数字", () => {
    const error = new ZhixiApiError("", 403, "device_limit_reached", null, 3);
    expect(error.userMessage).toContain("3 台");
  });
});
