
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    try {
      this._module = createRNNWasmModuleSync();
      this._node = new this._module.RNNoise();
      
      // Нам нужно 480 семплов для RNNoise. 
      // AudioWorklet дает 128 за раз.
      // Создаем буферы для накопления (входящий и исходящий)
      this._inputBuffer = new Float32Array(480);
      this._outputBuffer = new Float32Array(480);
      this._bufferIndex = 0;
      this._readIndex = 0;
      this._hasData = false;

      console.log('[RNNoiseProcessor] Initialized with Buffer (128 -> 480)');
    } catch (e) {
      console.error('[RNNoiseProcessor] Initialization failed:', e);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0] || !this._node) return true;

    const inputData = input[0];
    const outputData = output[0];

    // 1. Копируем входящие 128 семплов в наш буфер
    for (let i = 0; i < inputData.length; i++) {
        this._inputBuffer[this._bufferIndex] = inputData[i];
        
        // По мере накопления выдаем звук из выходного буфера (если он там есть)
        outputData[i] = this._hasData ? this._outputBuffer[this._readIndex] : inputData[i];
        
        this._bufferIndex++;
        this._readIndex++;

        // 2. Когда накопили ровно 480 - пора запускать ИИ!
        if (this._bufferIndex === 480) {
            const processed = this._node.calculate(this._inputBuffer);
            if (processed) {
                this._outputBuffer.set(processed);
                this._hasData = true;
            }
            this._bufferIndex = 0;
            this._readIndex = 0;
        }
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
