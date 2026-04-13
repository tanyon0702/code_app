import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";

export function useRuntimeSettings(setStatus) {
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({ modelPath: "", gpuLayers: "-1", ctxSize: "16384" });
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedModel = useMemo(
    () => models.find((model) => model.path === form.modelPath) ?? null,
    [models, form.modelPath],
  );

  async function fetchRuntimeModels() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/runtime/models`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "モデル一覧の取得に失敗しました。");
      }

      setModels(payload.models ?? []);
      setCurrent(payload.current ?? null);
      setForm({
        modelPath: payload.current?.model_path ?? payload.models?.[0]?.path ?? "",
        gpuLayers: String(payload.current?.gpu_layers ?? -1),
        ctxSize: String(payload.current?.ctx_size ?? 16384),
      });
      setEstimate(payload.current?.estimate ?? null);
    } catch (fetchError) {
      setError(fetchError.message);
      setStatus("モデル設定の取得に失敗");
    } finally {
      setLoading(false);
    }
  }

  function openRuntimeSettings() {
    setRuntimeOpen(true);
    fetchRuntimeModels();
  }

  useEffect(() => {
    if (!runtimeOpen || !form.modelPath) {
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setEstimateBusy(true);
      try {
        const response = await fetch(`${API_BASE}/api/runtime/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_path: form.modelPath,
            gpu_layers: Number(form.gpuLayers),
            ctx_size: Number(form.ctxSize),
          }),
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail || "必要メモリの見積もりに失敗しました。");
        }
        setEstimate(payload.estimate);
        setError("");
      } catch (estimateError) {
        if (estimateError.name !== "AbortError") {
          setError(estimateError.message);
        }
      } finally {
        setEstimateBusy(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [form.ctxSize, form.gpuLayers, form.modelPath, runtimeOpen]);

  async function applyRuntimeSettings(loadNow = false) {
    if (!form.modelPath) {
      return;
    }

    setSaving(true);
    setError("");
    setStatus(loadNow ? "モデルをロード中..." : "モデル設定を保存中...");

    try {
      const response = await fetch(`${API_BASE}/api/runtime/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_path: form.modelPath,
          gpu_layers: Number(form.gpuLayers),
          ctx_size: Number(form.ctxSize),
          load_now: loadNow,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "モデル設定の保存に失敗しました。");
      }

      setCurrent(payload.current);
      setEstimate(payload.current?.estimate ?? null);
      setStatus(loadNow ? "モデルをロードしました" : "モデル設定を保存しました");
      await fetchRuntimeModels();
    } catch (saveError) {
      setError(saveError.message);
      setStatus("モデル設定の反映に失敗");
    } finally {
      setSaving(false);
    }
  }

  return {
    runtimeOpen,
    setRuntimeOpen,
    models,
    current,
    form,
    setForm,
    estimate,
    loading,
    estimateBusy,
    saving,
    error,
    selectedModel,
    openRuntimeSettings,
    applyRuntimeSettings,
  };
}
