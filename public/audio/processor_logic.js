
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._initPromise = this.init();
  }

  async init() {
    try {
      const moduleCreator = createRNNWasmModuleSync();
      this._module = await moduleCreator;
      
      this._st = this._module._rnnoise_create();
      
      this._wasmInPtr = this._module._malloc(480 * 4);
      this._wasmOutPtr = this._module._malloc(480 * 4);
      
      this._inputBuffer = new Float32Array(480);
      this._outputBuffer = new Float32Array(480);
      this._bufferIndex = 0;
      this._readIndex = 0;
      this._hasData = false;

      this._initialized = true;
      console.log('[RNNoiseProcessor] 🔥 AI Engine Ready (Scaled API)');
    } catch (e) {
      console.error('[RNNoiseProcessor] ❌ Init Error:', e);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!this._initialized || !input || !input[0] || !output || !output[0]) {
      if (input && input[0] && output && output[0]) {
        output[0].set(input[0]);
      }
      return true;
    }

    const inputData = input[0];
    const outputData = output[0];

    for (let i = 0; i < inputData.length; i++) {
        this._inputBuffer[this._bufferIndex] = inputData[i];
        
        outputData[i] = this._hasData ? this._outputBuffer[this._readIndex] : inputData[i];
        
        this._bufferIndex++;
        this._readIndex++;

        if (this._bufferIndex === 480) {
            // МАСШТАБИРОВАНИЕ: Переводим из -1.0..1.0 в -32768..32768
            const wasmInView = this._module.HEAPF32.subarray(this._wasmInPtr / 4, this._wasmInPtr / 4 + 480);
            for (let j = 0; j < 480; j++) {
                wasmInView[j] = this._inputBuffer[j] * 32768;
            }
            
            this._module._rnnoise_process_frame(this._st, this._wasmOutPtr, this._wasmInPtr);
            
            // ОБРАТНОЕ МАСШТАБИРОВАНИЕ: Возвращаем в -1.0..1.0
            const wasmOutView = this._module.HEAPF32.subarray(this._wasmOutPtr / 4, this._wasmOutPtr / 4 + 480);
            for (let j = 0; j < 480; j++) {
                this._outputBuffer[j] = wasmOutView[j] / 32768;
            }
            
            this._hasData = true;
            this._bufferIndex = 0;
            this._readIndex = 0;
        }
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
