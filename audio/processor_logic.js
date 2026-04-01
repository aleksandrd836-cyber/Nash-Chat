
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._intensity = 1.0; // 0.0 to 1.0
    
    // Высокоскоростные статические буферы (никаких push/splice)
    this._ringIn = new Float32Array(1024);
    this._ringOut = new Float32Array(1024);
    this._writePos = 0;
    this._readPos = 0;
    this._pending = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'setIntensity') {
        this._intensity = e.data.value / 100;
      }
    };

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
      console.log('[RNNoiseProcessor] 🔥 Engine 2.5.0 Premium Active');
    } catch (e) {
      console.error('[RNNoiseProcessor] Init error:', e);
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
        const pos = (this._writePos + i) % this._ringIn.length;
        this._ringIn[pos] = inputData[i];
    }
    this._writePos = (this._writePos + inputData.length) % this._ringIn.length;
    this._pending += inputData.length;

    // 2. Обрабатываем, если накопили 480 семплов
    while (this._pending >= 480) {
        const wasmInView = this._module.HEAPF32.subarray(this._wasmInPtr / 4, this._wasmInPtr / 4 + 480);
        let tempRead = (this._writePos - this._pending + this._ringIn.length) % this._ringIn.length;
        
        // Масштабируем и копируем в WASM
        for (let j = 0; j < 480; j++) {
            const val = this._ringIn[tempRead];
            wasmInView[j] = val * 32768;
            tempRead = (tempRead + 1) % this._ringIn.length;
        }

        this._module._rnnoise_process_frame(this._st, this._wasmOutPtr, this._wasmInPtr);

        const processed = this._module.HEAPF32.subarray(this._wasmOutPtr / 4, this._wasmOutPtr / 4 + 480);
        let tempWrite = (this._writePos - this._pending + this._ringIn.length) % this._ringIn.length;
        
        // МИКШИРОВАНИЕ ДЛЯ ПОЛЗУНКА: Смешиваем чистый и сырой звук
        for (let j = 0; j < 480; j++) {
            const dry = this._ringIn[tempWrite];
            const wet = processed[j] / 32768;
            // Формула плавного смешивания: Сила * Чистый + (1 - Сила) * Сырой
            this._ringOut[tempWrite] = (wet * this._intensity) + (dry * (1.0 - this._intensity));
            tempWrite = (tempWrite + 1) % this._ringIn.length;
        }

        this._pending -= 480;
    }

    // 3. Отдаем результат (с задержкой на время обработки кадра)
    let outRead = (this._readPos) % this._ringOut.length;
    for (let i = 0; i < inputData.length; i++) {
        outputData[i] = this._ringOut[outRead];
        outRead = (outRead + 1) % this._ringOut.length;
    }
    this._readPos = outRead;

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
