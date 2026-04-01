
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._framesProcessed = 0;
    
    // Внутренние буферы (простая линейная очередь)
    this._inputBuffer = []; // Массив для входящих семплов
    this._outputBuffer = []; // Массив для очищенных семплов
    
    this.init();
  }

  async init() {
    try {
      const moduleCreator = createRNNWasmModuleSync();
      this._module = await moduleCreator;
      this._st = this._module._rnnoise_create();
      this._wasmInPtr = this._module._malloc(480 * 4);
      this._wasmOutPtr = this._module._malloc(480 * 4);
      
      this._initialized = true;
      console.log('[RNNoiseProcessor] 🔥 AI Engine 2.4.3 READY (Crystal Clear Mode)');
    } catch (e) {
      console.error('[RNNoiseProcessor] ❌ Init Error:', e);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // Если не инициализировано или нет звука - пропускаем как есть
    if (!this._initialized || !input || !input[0] || !output || !output[0]) {
      if (input && input[0] && output && output[0]) output[0].set(input[0]);
      return true;
    }

    const inputData = input[0];
    const outputData = output[0];

    // 1. Добавляем входящие 128 семплов в очередь ввода
    for (let i = 0; i < inputData.length; i++) {
        this._inputBuffer.push(inputData[i]);
    }

    // 2. Если в очереди накопилось 480 или больше - обрабатываем кадр
    while (this._inputBuffer.length >= 480) {
        const frame = new Float32Array(this._inputBuffer.splice(0, 480));
        
        // Масштабируем до Int16 и кладем в WASM
        const wasmInView = this._module.HEAPF32.subarray(this._wasmInPtr / 4, this._wasmInPtr / 4 + 480);
        for (let j = 0; j < 480; j++) {
            wasmInView[j] = frame[j] * 32768;
        }

        const speechProb = this._module._rnnoise_process_frame(this._st, this._wasmOutPtr, this._wasmInPtr);
        
        // Логируем вероятность речи
        if (this._framesProcessed++ % 100 === 0) {
            console.log(`[RNNoise] Probability: ${(speechProb * 100).toFixed(0)}% | Queue: ${this._inputBuffer.length} samples`);
        }

        // Забираем результат, нормализуем и кладем в очередь вывода
        const processed = this._module.HEAPF32.subarray(this._wasmOutPtr / 4, this._wasmOutPtr / 4 + 480);
        for (let j = 0; j < 480; j++) {
            this._outputBuffer.push(processed[j] / 32768);
        }
    }

    // 3. Выдаем данные из очереди вывода в браузер (по 128 за раз)
    if (this._outputBuffer.length >= inputData.length) {
        const toOutput = this._outputBuffer.splice(0, inputData.length);
        outputData.set(toOutput);
    } else {
        // Если вдруг ИИ не успел нагрузить очередь вывода (бывает на старте)
        outputData.set(inputData);
    }

    // Защита от переполнения (если ИИ зависнет)
    if (this._inputBuffer.length > 2000) this._inputBuffer = [];
    if (this._outputBuffer.length > 2000) this._outputBuffer = [];

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
