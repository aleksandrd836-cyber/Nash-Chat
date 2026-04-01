
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._initPromise = this.init();
  }

  async init() {
    try {
      // Инициализируем модуль Jitsi
      const moduleCreator = createRNNWasmModuleSync();
      // Ждем готовности модуля (в Emscripten это возвращает Promise)
      this._module = await moduleCreator;
      
      // Создаем состояние нейросети напрямую через C-функцию
      this._st = this._module._rnnoise_create();
      
      // Выделяем память в куче WASM для 480 семплов (480 * 4 байта)
      this._wasmInPtr = this._module._malloc(480 * 4);
      this._wasmOutPtr = this._module._malloc(480 * 4);
      
      // Буферы для накопления (AudioWorklet 128 -> RNNoise 480)
      this._inputBuffer = new Float32Array(480);
      this._outputBuffer = new Float32Array(480);
      this._bufferIndex = 0;
      this._readIndex = 0;
      this._hasData = false;

      this._initialized = true;
      console.log('[RNNoiseProcessor] 🔥 AI Engine Ready (Raw C API)');
    } catch (e) {
      console.error('[RNNoiseProcessor] ❌ Init Error:', e);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // Если ИИ еще грузится или звука нет - просто пропускаем сырой сигнал
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
        
        // Выдаем обработанный звук или сырой, если данных еще нет
        outputData[i] = this._hasData ? this._outputBuffer[this._readIndex] : inputData[i];
        
        this._bufferIndex++;
        this._readIndex++;

        // Как только накопили 480 семплов - прогоняем через ИИ
        if (this._bufferIndex === 480) {
            // Копируем данные в память WASM
            this._module.HEAPF32.set(this._inputBuffer, this._wasmInPtr / 4);
            
            // Запускаем очистку (инпуты, аутпуты, состояние)
            this._module._rnnoise_process_frame(this._st, this._wasmOutPtr, this._wasmInPtr);
            
            // Забираем очищенный звук обратно
            this._outputBuffer.set(this._module.HEAPF32.subarray(this._wasmOutPtr / 4, this._wasmOutPtr / 4 + 480));
            
            this._hasData = true;
            this._bufferIndex = 0;
            this._readIndex = 0;
        }
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
