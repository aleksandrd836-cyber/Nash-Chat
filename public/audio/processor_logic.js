
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    try {
      // Это инициализирует нейросеть из библиотеки Jitsi
      this._module = createRNNWasmModuleSync();
      this._node = new this._module.RNNoise();
      console.log('[RNNoiseProcessor] Initialized successfully with Sync Wasm 🔥');
    } catch (e) {
      console.error('[RNNoiseProcessor] Initialization failed:', e);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // Если нет входного сигнала или нода не готова - просто пропускаем сырой звук (Safe Fallback)
    if (!input || !input[0] || !this._node) return true;

    try {
      const rawData = input[0];
      const processedData = this._node.calculate(rawData);
      
      if (processedData) {
        output[0].set(processedData);
      } else {
        output[0].set(rawData);
      }
    } catch (err) {
      if (input[0]) output[0].set(input[0]);
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
