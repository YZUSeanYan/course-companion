// 设置页：AI 服务地址、账号额度、设备身份与隐私说明。

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { zhixi, loadGatewayUrl, saveGatewayUrl, loadDeviceCredential, clearDeviceCredential } from "../lib/api/client";
import { resolveModelBaseUrl, saveModelBaseUrlOverride } from "../lib/offline/model-manager";
import AccountCard from "../components/AccountCard";
import SyncCard from "../components/SyncCard";
import { fullSync } from "../lib/sync/sync";

export default function SettingsPage() {
  const [gateway, setGateway] = useState(loadGatewayUrl());
  const [health, setHealth] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [modelBase, setModelBase] = useState(resolveModelBaseUrl());

  useEffect(() => {
    setDeviceId(loadDeviceCredential()?.deviceId ?? null);
  }, []);

  const testConnection = async () => {
    saveGatewayUrl(gateway);
    setHealth("测试中…");
    try {
      const status = await zhixi.health();
      setHealth(status.providerConfigured ? "已连接 · AI 服务就绪" : "已连接 · AI 服务未配置");
    } catch (error) {
      setHealth(error instanceof Error ? error.message : String(error));
    }
  };

  const resetDevice = () => {
    clearDeviceCredential();
    setDeviceId(null);
    setHealth("设备身份已清除，下次请求将自动重新注册");
  };

  return (
    <main>
      <h1 className="page-title">设置</h1>
      <div className="glass-card">
        <div className="card-title">AI 服务连接</div>
        <p className="card-desc">学习包、翻译、文档解析与云端听课都通过该网关完成；密钥只保存在服务端，浏览器不保存任何 API Key。</p>
        <input
          className="text-input"
          value={gateway}
          onChange={(event) => setGateway(event.target.value)}
          placeholder="https://zhixi.example.com"
        />
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => void testConnection()}>
            保存并测试
          </button>
        </div>
        {health && <p className="muted" style={{ marginBottom: 0 }}>{health}</p>}
      </div>

      {/* 激活成功后自动完整同步一次（fire-and-forget），结果由 SyncCard 展示。 */}
      <AccountCard onActivated={() => void fullSync()} />

      <SyncCard />

      <div className="glass-card">
        <div className="card-title">离线识别模型镜像</div>
        <p className="card-desc">浏览器离线识别的 WASM 产物（约 200MB，一次性下载后缓存）。本地联调或内网镜像可在此覆盖根地址。</p>
        <input
          className="text-input"
          value={modelBase}
          onChange={(event) => setModelBase(event.target.value)}
          placeholder="https://shuike.seanyan.store/models/zhixi/web/asr-zh-en-v1/"
        />
        <div className="btn-row">
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              saveModelBaseUrlOverride(modelBase);
              setHealth("模型镜像地址已保存");
            }}
          >
            保存镜像地址
          </button>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-title">设备身份</div>
        <p className="card-desc">匿名设备令牌仅保存在本浏览器；服务端只存 HMAC 摘要，无法找回，清除后会自动重新注册。</p>
        <div className="list-item">
          <span className="muted">设备 ID</span>
          <span style={{ fontFamily: "monospace", fontSize: 12 }}>{deviceId ?? "未注册"}</span>
        </div>
        <div className="btn-row">
          <button className="btn btn-sm btn-danger" onClick={resetDevice}>
            清除设备身份
          </button>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-title">关于与隐私</div>
        <p className="muted">知习网页版 v0.1 · 云端听课 + AI 学习包 + FSRS 复习。浏览器离线识别（sherpa-onnx WASM）规划于二期。</p>
        <div className="btn-row">
          <Link className="btn btn-sm" to="/privacy">
            隐私政策
          </Link>
        </div>
      </div>
    </main>
  );
}
