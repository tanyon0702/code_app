function MetricCard({ label, value, hint }) {
  return (
    <article className="runtime-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export default function RuntimeSettingsModal({
  open,
  loading,
  saving,
  error,
  current,
  models,
  selectedModel,
  form,
  estimate,
  estimateBusy,
  onClose,
  onChangeForm,
  onApply,
  onLoadNow,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <section className="prompt-modal panel runtime-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Runtime Settings</p>
            <h2>モデルとロード設定</h2>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="prompt-copy">
          `model` フォルダ内の GGUF から選択できます。VRAM / RAM は選択中の GPU レイヤーと
          context size を前提にした概算です。
        </p>

        {error ? <div className="runtime-error">{error}</div> : null}

        <div className="runtime-layout">
          <div className="runtime-model-list">
            {loading ? <div className="empty-state">モデル一覧を読み込み中...</div> : null}

            {!loading &&
              models.map((model) => (
                <button
                  key={model.path}
                  className={`runtime-model-card ${form.modelPath === model.path ? "selected" : ""}`}
                  onClick={() => onChangeForm({ modelPath: model.path })}
                >
                  <strong>{model.name}</strong>
                  <span>{model.file_name}</span>
                  <span>{model.file_size_label}</span>
                  <small>{model.total_layers > 0 ? `${model.total_layers} layers` : "layers unknown"}</small>
                </button>
              ))}
          </div>

          <div className="runtime-panel">
            <div className="runtime-fields">
              <label className="runtime-field">
                <span>Model Path</span>
                <input value={form.modelPath} readOnly />
              </label>
              <label className="runtime-field">
                <span>GPU Layers</span>
                <input
                  type="number"
                  value={form.gpuLayers}
                  onChange={(event) => onChangeForm({ gpuLayers: event.target.value })}
                />
              </label>
              <label className="runtime-field">
                <span>Context Size</span>
                <input
                  type="number"
                  min="1024"
                  step="1024"
                  value={form.ctxSize}
                  onChange={(event) => onChangeForm({ ctxSize: event.target.value })}
                />
              </label>
            </div>

            {current ? (
              <div className="runtime-current">
                <span>現在の設定</span>
                <strong>{current.model_name}</strong>
                <small>
                  GPU Layers: {current.gpu_layers} / Context: {current.ctx_size}
                </small>
              </div>
            ) : null}

            {selectedModel ? (
              <div className="runtime-meta">
                <span>{selectedModel.architecture}</span>
                <span>{selectedModel.file_size_label}</span>
                <span>
                  {selectedModel.trained_context_length > 0
                    ? `trained ctx ${selectedModel.trained_context_length}`
                    : "trained ctx unknown"}
                </span>
              </div>
            ) : null}

            <div className="runtime-metrics">
              <MetricCard
                label="Estimated VRAM"
                value={estimate ? estimate.estimated_vram_label : "..."}
                hint={estimateBusy ? "計算中..." : "ロード時の概算"}
              />
              <MetricCard
                label="Estimated RAM"
                value={estimate ? estimate.estimated_ram_label : "..."}
                hint={estimate ? estimate.note : ""}
              />
              <MetricCard
                label="Model Size"
                value={estimate ? estimate.file_size_label : selectedModel?.file_size_label ?? "..."}
                hint={estimate ? `${estimate.resolved_gpu_layers} layers offloaded` : ""}
              />
              <MetricCard
                label="KV Cache"
                value={estimate ? estimate.kv_cache_label : "..."}
                hint={estimate ? `ctx ${estimate.ctx_size}` : ""}
              />
            </div>
          </div>
        </div>

        <div className="tool-actions">
          <span className="tool-hint">`GPU Layers=-1` で可能な限り GPU へ載せます。</span>
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button className="ghost-button" onClick={() => onApply(false)} disabled={saving || !form.modelPath}>
            Save Settings
          </button>
          <button className="primary-button" onClick={() => onLoadNow()} disabled={saving || !form.modelPath}>
            Apply And Load
          </button>
        </div>
      </section>
    </div>
  );
}
