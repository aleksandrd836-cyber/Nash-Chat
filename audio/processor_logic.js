
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._initialized = false;
    this._intensity = 1.0;
    this._framesProcessed = 0;
    
    // Линейный буфер фиксированного размера (1024 семпла достаточно для 128/480 моста)
    // Мы используем фиксированные массивы для исключения пауз "сбора мусора" (GC)
    this._inputBuffer = new Float32Array(1024);
    this._outputBuffer = new Float32Array(1024);
    this._inputPtr = 0;
    this._outputPtr = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'setIntensity') {
        this._intensity = e.data.value / 100;
        console.log(`[RNNoiseProcessor] Intensity set to: ${(this._intensity * 100).toFixed(0)}%`);
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
      console.log('[RNNoiseProcessor] 🔥 Engine v2.5.1 GOLDEN READY');
    } catch (e) {
      console.error('[RNNoiseProcessor] ❌ Init error:', e);
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

    // 1. Копируем входящие данные в конец буфера ввода
    if (this._inputPtr + 128 <= 1024) {
      this._inputBuffer.set(inputData, this._inputPtr);
      this._inputPtr += 128;
    }

    // 2. Обрабатываем всё, что накопили кратно 480
    while (this._inputPtr >= 480) {
      const wasmInView = this._module.HEAPF32.subarray(this._wasmInPtr / 4, this._wasmInPtr / 4 + 480);
      
      // Готовим данные для WASM (масштабируем до Int16)
      for (let j = 0; j < 480; j++) {
        wasmInView[j] = this._inputBuffer[j] * 32768;
      }

      const speechProb = this._module._rnnoise_process_frame(this._st, this._wasmOutPtr, this._wasmInPtr);
      const filtered = this._module.HEAPF32.subarray(this._wasmOutPtr / 4, this._wasmOutPtr / 4 + 480);

      // MIXING (Dry/Wet) + Копируем в буфер вывода
      for (let j = 0; j < 480; j++) {
        const dry = this._inputBuffer[j];
        const wet = filtered[j] / 32768;
        this._outputBuffer[this._outputPtr + j] = (wet * this._intensity) + (dry * (1.0 - this._intensity));
      }
      this._outputPtr += 480;

      // Сдвигаем буфер ввода (удаляем отработанные 480 семплов)
      this._inputBuffer.copyWithin(0, 480, this._inputPtr);
      this._inputPtr -= 480;
    }

    // 3. Отдаем результат из буфера вывода (если там есть хотя бы 128)
    if (this._outputPtr >= 128) {
      outputData.set(this._outputBuffer.subarray(0, 128));
      
      // Сдвигаем буфер вывода (удаляем отданные 128 семплов)
      this._outputBuffer.copyWithin(0, 128, this._outputPtr);
      this._outputPtr -= 128;
    } else {
      // Подстраховка: если буфер вывода пуст (микро-лаг), отдаем вход
      outputData.set(inputData);
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
