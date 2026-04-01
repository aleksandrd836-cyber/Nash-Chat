
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._framesProcessed = 0;
    this.init();
  }

  async init() {
    try {
      const moduleCreator = createRNNWasmModuleSync();
      this._module = await moduleCreator;
      
      this._st = this._module._rnnoise_create();
      
      // Память WASM (480 семплов по 4 байта)
      this._wasmInPtr = this._module._malloc(480 * 4);
      this._wasmOutPtr = this._module._malloc(480 * 4);
      
      // Кольцевой буфер для сопряжения 128 (Worklet) и 480 (RNNoise)
      this._circularBuffer = new Float32Array(480 * 2); 
      this._writePos = 0;
      this._readPos = 0;
      this._pendingSamples = 0;

      this._initialized = true;
      console.log('[RNNoiseProcessor] 🔥 AI Engine 2.4.2 READY (48kHz Optimized)');
    } catch (e) {
      console.error('[RNNoiseProcessor] ❌ Init Error:', e);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!this._initialized || !input || !input[0] || !output || !output[0]) {
      if (input && input[0] && output && output[0]) output[0].set(input[0]);
      return true;
    }

    const inputData = input[0];
    const outputData = output[0];

    // 1. Пишем входящие данные в кольцевой буфер
    for (let i = 0; i < inputData.length; i++) {
        this._circularBuffer[this._writePos] = inputData[i];
        this._writePos = (this._writePos + 1) % this._circularBuffer.length;
        this._pendingSamples++;
    }

    // 2. Если накопили 480 - обрабатываем
    if (this._pendingSamples >= 480) {
        const tempBuf = new Float32Array(480);
        let tempReadPos = (this._writePos - 480 + this._circularBuffer.length) % this._circularBuffer.length;
        
        for (let j = 0; j < 480; j++) {
            tempBuf[j] = this._circularBuffer[tempReadPos] * 32768; // Масштабируем до Int16
            tempReadPos = (tempReadPos + 1) % this._circularBuffer.length;
        }

        // Копируем в WASM и вызываем нейронку
        this._module.HEAPF32.set(tempBuf, this._wasmInPtr / 4);
        const speechProb = this._module._rnnoise_process_frame(this._st, this._wasmOutPtr, this._wasmInPtr);
        
        // Диагностика каждые 100 кадров (примерно раз в секунду)
        if (this._framesProcessed++ % 100 === 0) {
            console.log(`[RNNoise] Speech Probability: ${(speechProb * 100).toFixed(1)}% 🛡️`);
        }

        // Забираем очищенный звук и нормализуем обратно
        const processed = this._module.HEAPF32.subarray(this._wasmOutPtr / 4, this._wasmOutPtr / 4 + 480);
        for (let j = 0; j < 480; j++) {
            processed[j] /= 32768;
        }

        // Записываем результат в "голову" буфера вывода
        let tempWriteBackPos = (this._writePos - 480 + this._circularBuffer.length) % this._circularBuffer.length;
        for (let j = 0; j < 480; j++) {
            this._circularBuffer[tempWriteBackPos] = processed[j];
            tempWriteBackPos = (tempWriteBackPos + 1) % this._circularBuffer.length;
        }
    }

    // 3. Выдаем данные из буфера в выход (с задержкой на один кадр обработки)
    let readPos = (this._writePos - inputData.length + this._circularBuffer.length) % this._circularBuffer.length;
    for (let i = 0; i < inputData.length; i++) {
        outputData[i] = this._circularBuffer[readPos];
        readPos = (readPos + 1) % this._circularBuffer.length;
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
