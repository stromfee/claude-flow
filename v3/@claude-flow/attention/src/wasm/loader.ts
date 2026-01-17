/**
 * @claude-flow/attention - WASM Module Loader
 *
 * Handles loading and initialization of ruvector WASM modules
 * with graceful fallback to TypeScript implementations.
 */

import type { WASMInitOptions, RuVectorWASM } from '../types.js';

/** WASM module instance singleton */
let wasmInstance: RuVectorWASM | null = null;
let initPromise: Promise<RuVectorWASM | null> | null = null;
let initAttempted = false;

/**
 * Check if WASM is available in the current environment
 */
export async function isWASMAvailable(): Promise<boolean> {
  if (typeof WebAssembly === 'undefined') {
    return false;
  }

  try {
    // Test basic WASM support
    const testModule = new WebAssembly.Module(
      new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
    );
    return testModule instanceof WebAssembly.Module;
  } catch {
    return false;
  }
}

/**
 * Check if SIMD is available
 */
export async function isSIMDAvailable(): Promise<boolean> {
  if (!(await isWASMAvailable())) {
    return false;
  }

  try {
    // SIMD detection via feature test
    const simdTest = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // v128 return type
      0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01,
      0x08, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x0b,
    ]);
    const module = new WebAssembly.Module(simdTest);
    return module instanceof WebAssembly.Module;
  } catch {
    return false;
  }
}

/**
 * Load the ruvector WASM module
 */
export async function loadWASM(
  options: WASMInitOptions = {}
): Promise<RuVectorWASM | null> {
  // Return cached instance if available
  if (wasmInstance) {
    return wasmInstance;
  }

  // Return pending init if in progress
  if (initPromise) {
    return initPromise;
  }

  // Only try once
  if (initAttempted) {
    return null;
  }

  initAttempted = true;

  initPromise = (async () => {
    try {
      // Check WASM availability first
      if (!(await isWASMAvailable())) {
        console.warn('[@claude-flow/attention] WASM not available, using TypeScript fallback');
        return null;
      }

      // Try to load ruvector WASM module
      let ruvectorModule: any;

      try {
        // Dynamic import to avoid bundling issues
        ruvectorModule = await import('ruvector');
      } catch (importError) {
        // Try alternative package name
        try {
          ruvectorModule = await import('@ruvector/attention');
        } catch {
          console.warn(
            '[@claude-flow/attention] ruvector package not found, using TypeScript fallback'
          );
          return null;
        }
      }

      // Initialize the WASM module
      if (ruvectorModule.init) {
        await ruvectorModule.init({
          enableSIMD: options.enableSIMD ?? (await isSIMDAvailable()),
          numThreads: options.numThreads ?? navigator?.hardwareConcurrency ?? 4,
          memoryLimit: options.memoryLimit ?? 512 * 1024 * 1024, // 512MB default
        });
      }

      // Create WASM bridge interface
      wasmInstance = createWASMBridge(ruvectorModule);

      console.info(
        '[@claude-flow/attention] WASM initialized',
        wasmInstance?.simdAvailable() ? '(SIMD enabled)' : '(no SIMD)'
      );

      return wasmInstance;
    } catch (error) {
      console.warn('[@claude-flow/attention] WASM init failed:', error);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Create a bridge interface from the raw WASM module
 */
function createWASMBridge(module: any): RuVectorWASM {
  let simdEnabled = false;

  return {
    async init(): Promise<void> {
      if (module.init) {
        await module.init();
      }
    },

    simdAvailable(): boolean {
      if (module.simdAvailable) {
        simdEnabled = module.simdAvailable();
      }
      return simdEnabled;
    },

    dotProductAttention(
      query: Float32Array,
      keys: Float32Array,
      values: Float32Array,
      seqLen: number,
      dim: number
    ): Float32Array {
      if (module.dotProductAttention) {
        return module.dotProductAttention(query, keys, values, seqLen, dim);
      }
      // Fallback to manual implementation
      return dotProductAttentionJS(query, keys, values, seqLen, dim);
    },

    flashAttention(
      query: Float32Array,
      keys: Float32Array,
      values: Float32Array,
      seqLen: number,
      dim: number,
      causal: boolean
    ): Float32Array {
      if (module.flashAttention) {
        return module.flashAttention(query, keys, values, seqLen, dim, causal);
      }
      // Fallback
      return flashAttentionJS(query, keys, values, seqLen, dim, causal);
    },

    linearAttention(
      query: Float32Array,
      keys: Float32Array,
      values: Float32Array,
      seqLen: number,
      dim: number,
      numFeatures: number
    ): Float32Array {
      if (module.linearAttention) {
        return module.linearAttention(query, keys, values, seqLen, dim, numFeatures);
      }
      return linearAttentionJS(query, keys, values, seqLen, dim, numFeatures);
    },

    poincareDistance(x: Float32Array, y: Float32Array, curvature: number): number {
      if (module.poincareDistance) {
        return module.poincareDistance(x, y, curvature);
      }
      return poincareDistanceJS(x, y, curvature);
    },

    hnswSearch(
      query: Float32Array,
      k: number,
      efSearch?: number
    ): { indices: Uint32Array; distances: Float32Array } {
      if (module.hnswSearch) {
        return module.hnswSearch(query, k, efSearch ?? k * 2);
      }
      // Return empty result for fallback
      return {
        indices: new Uint32Array(k),
        distances: new Float32Array(k),
      };
    },
  };
}

// ============================================================================
// JavaScript Fallback Implementations
// ============================================================================

function dotProductAttentionJS(
  query: Float32Array,
  keys: Float32Array,
  values: Float32Array,
  seqLen: number,
  dim: number
): Float32Array {
  const scale = 1 / Math.sqrt(dim);
  const output = new Float32Array(dim);
  const scores = new Float32Array(seqLen);

  // Compute attention scores
  for (let i = 0; i < seqLen; i++) {
    let score = 0;
    for (let j = 0; j < dim; j++) {
      score += query[j] * keys[i * dim + j];
    }
    scores[i] = score * scale;
  }

  // Softmax
  const maxScore = Math.max(...scores);
  let sumExp = 0;
  for (let i = 0; i < seqLen; i++) {
    scores[i] = Math.exp(scores[i] - maxScore);
    sumExp += scores[i];
  }
  for (let i = 0; i < seqLen; i++) {
    scores[i] /= sumExp;
  }

  // Weighted sum
  for (let i = 0; i < seqLen; i++) {
    for (let j = 0; j < dim; j++) {
      output[j] += scores[i] * values[i * dim + j];
    }
  }

  return output;
}

function flashAttentionJS(
  query: Float32Array,
  keys: Float32Array,
  values: Float32Array,
  seqLen: number,
  dim: number,
  causal: boolean
): Float32Array {
  const blockSize = 64;
  const scale = 1 / Math.sqrt(dim);
  const output = new Float32Array(dim);
  const numBlocks = Math.ceil(seqLen / blockSize);

  let maxScore = -Infinity;
  let sumExp = 0;
  const weightedSum = new Float32Array(dim);

  // Block-wise processing
  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const blockStart = blockIdx * blockSize;
    const blockEnd = Math.min(blockStart + blockSize, seqLen);

    // Compute block scores
    const blockScores = new Float32Array(blockEnd - blockStart);
    for (let i = blockStart; i < blockEnd; i++) {
      if (causal && i > seqLen - 1) {
        blockScores[i - blockStart] = -Infinity;
        continue;
      }
      let score = 0;
      for (let j = 0; j < dim; j++) {
        score += query[j] * keys[i * dim + j];
      }
      blockScores[i - blockStart] = score * scale;
    }

    // Update running max and sum
    const blockMax = Math.max(...blockScores);
    if (blockMax > maxScore) {
      const rescale = Math.exp(maxScore - blockMax);
      sumExp *= rescale;
      for (let j = 0; j < dim; j++) {
        weightedSum[j] *= rescale;
      }
      maxScore = blockMax;
    }

    // Accumulate weighted values
    for (let i = blockStart; i < blockEnd; i++) {
      const localIdx = i - blockStart;
      const weight = Math.exp(blockScores[localIdx] - maxScore);
      sumExp += weight;
      for (let j = 0; j < dim; j++) {
        weightedSum[j] += weight * values[i * dim + j];
      }
    }
  }

  // Normalize
  for (let j = 0; j < dim; j++) {
    output[j] = weightedSum[j] / sumExp;
  }

  return output;
}

function linearAttentionJS(
  query: Float32Array,
  keys: Float32Array,
  values: Float32Array,
  seqLen: number,
  dim: number,
  numFeatures: number
): Float32Array {
  const output = new Float32Array(dim);

  // Apply ELU feature map: f(x) = x + 1 if x > 0, exp(x) otherwise
  const applyFeatureMap = (x: number): number => (x > 0 ? x + 1 : Math.exp(x));

  // Transform query
  const phiQ = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    phiQ[i] = applyFeatureMap(query[i]);
  }

  // Compute KV sum and K sum
  const kvSum = new Float32Array(dim * dim);
  const kSum = new Float32Array(dim);

  for (let i = 0; i < seqLen; i++) {
    // Transform key
    const phiK = new Float32Array(dim);
    for (let j = 0; j < dim; j++) {
      phiK[j] = applyFeatureMap(keys[i * dim + j]);
      kSum[j] += phiK[j];
    }

    // Outer product
    for (let j = 0; j < dim; j++) {
      for (let k = 0; k < dim; k++) {
        kvSum[j * dim + k] += phiK[j] * values[i * dim + k];
      }
    }
  }

  // Compute output: (phiQ @ KV) / (phiQ @ K_sum)
  let denom = 0;
  for (let i = 0; i < dim; i++) {
    denom += phiQ[i] * kSum[i];
  }

  for (let j = 0; j < dim; j++) {
    let num = 0;
    for (let i = 0; i < dim; i++) {
      num += phiQ[i] * kvSum[i * dim + j];
    }
    output[j] = num / (denom + 1e-6);
  }

  return output;
}

function poincareDistanceJS(x: Float32Array, y: Float32Array, c: number): number {
  let normX = 0;
  let normY = 0;
  let normDiff = 0;

  for (let i = 0; i < x.length; i++) {
    normX += x[i] * x[i];
    normY += y[i] * y[i];
    const diff = x[i] - y[i];
    normDiff += diff * diff;
  }

  normX = Math.sqrt(normX);
  normY = Math.sqrt(normY);
  normDiff = Math.sqrt(normDiff);

  const sqrtC = Math.sqrt(Math.abs(c));
  const num = 2 * normDiff * normDiff;
  const denom = (1 - normX * normX) * (1 - normY * normY);

  return (1 / sqrtC) * Math.acosh(1 + num / Math.max(denom, 1e-6));
}

/**
 * Get the WASM instance (if initialized)
 */
export function getWASMInstance(): RuVectorWASM | null {
  return wasmInstance;
}

/**
 * Reset WASM state (for testing)
 */
export function resetWASM(): void {
  wasmInstance = null;
  initPromise = null;
  initAttempted = false;
}
