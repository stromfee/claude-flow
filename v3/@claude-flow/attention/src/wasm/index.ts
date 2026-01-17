/**
 * @claude-flow/attention - WASM Module Exports
 *
 * Public API for WASM-accelerated attention operations.
 */

export {
  loadWASM,
  isWASMAvailable,
  isSIMDAvailable,
  getWASMInstance,
  resetWASM,
} from './loader.js';

export { WASMBridge } from './bridge.js';
