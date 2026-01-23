/**
 * Prime Radiant Plugin - Type Definitions
 *
 * Core types for mathematical AI interpretability engines including
 * sheaf cohomology, spectral analysis, causal inference, quantum topology,
 * category theory, and homotopy type theory.
 */

// ============================================================================
// Value Objects
// ============================================================================

/**
 * Coherence Energy - measures contradiction level using Sheaf Laplacian
 * Range: [0, 1] where 0 = fully coherent, 1 = fully contradictory
 */
export interface CoherenceEnergy {
  readonly value: number;
  readonly coherent: boolean;
  readonly confidence: number;
  readonly level: 'coherent' | 'warning' | 'contradictory';
}

/**
 * Spectral Gap - difference between first and second eigenvalues
 * Positive gap indicates stability
 */
export interface SpectralGap {
  readonly value: number;
  readonly stable: boolean;
  readonly stabilityLevel: 'stable' | 'marginal' | 'unstable';
}

/**
 * Causal Effect - estimated effect of intervention on outcome
 */
export interface CausalEffect {
  readonly value: number;
  readonly confidence: number;
  readonly significant: boolean;
  readonly direction: 'positive' | 'negative' | 'neutral';
}

/**
 * Betti Numbers - topological invariants
 * b0 = connected components, b1 = loops, b2 = voids
 */
export interface BettiNumbers {
  readonly values: number[];
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly connected: boolean;
  readonly hasLoops: boolean;
  readonly hasVoids: boolean;
}

/**
 * Persistence Diagram point - birth and death times
 */
export interface PersistencePoint {
  readonly birth: number;
  readonly death: number;
  readonly persistence: number;
  readonly dimension: number;
}

/**
 * Persistence Diagram - collection of persistence points
 */
export interface PersistenceDiagram {
  readonly points: PersistencePoint[];
  readonly maxPersistence: number;
  readonly totalPersistence: number;
}

// ============================================================================
// Coherence Types
// ============================================================================

/**
 * Result from coherence check using Sheaf Laplacian
 */
export interface CoherenceResult {
  readonly coherent: boolean;
  readonly energy: number;
  readonly violations: string[];
  readonly confidence: number;
}

/**
 * Sheaf structure for coherence computation
 */
export interface Sheaf {
  readonly vertices: number[];
  readonly edges: Array<[number, number]>;
  readonly restrictions: Map<string, Float32Array>;
}

// ============================================================================
// Spectral Types
// ============================================================================

/**
 * Result from spectral stability analysis
 */
export interface SpectralResult {
  readonly stable: boolean;
  readonly eigenvalues: number[];
  readonly spectralGap: number;
  readonly stabilityIndex: number;
}

/**
 * Matrix representation for spectral analysis
 */
export interface Matrix {
  readonly data: number[][] | Float32Array;
  readonly rows: number;
  readonly cols: number;
}

// ============================================================================
// Causal Types
// ============================================================================

/**
 * Causal graph structure
 */
export interface CausalGraph {
  readonly nodes: string[];
  readonly edges: Array<[string, string]>;
}

/**
 * Intervention in causal inference
 */
export interface Intervention {
  readonly treatment: string;
  readonly outcome: string;
  readonly graph: CausalGraph;
  readonly observedData?: Map<string, number[]>;
}

/**
 * Result from causal inference
 */
export interface CausalResult {
  readonly effect: number;
  readonly confounders: string[];
  readonly interventionValid: boolean;
  readonly backdoorPaths: string[][];
}

// ============================================================================
// Quantum Topology Types
// ============================================================================

/**
 * Simplicial complex for topological computations
 */
export interface SimplicialComplex {
  readonly vertices: number[];
  readonly simplices: number[][];
  readonly maxDimension: number;
}

/**
 * Filtration for persistent homology
 */
export interface Filtration {
  readonly complex: SimplicialComplex;
  readonly values: number[];
}

/**
 * Result from quantum topology computation
 */
export interface TopologyResult {
  readonly bettiNumbers: number[];
  readonly persistenceDiagram: PersistenceDiagram;
  readonly homologyClasses: number;
}

// ============================================================================
// Category Theory Types
// ============================================================================

/**
 * Morphism in a category
 */
export interface Morphism {
  readonly source: string;
  readonly target: string;
  readonly name: string;
  readonly data?: unknown;
}

/**
 * Result from morphism application
 */
export interface MorphismResult {
  readonly valid: boolean;
  readonly result: unknown;
  readonly naturalTransformation: boolean;
}

/**
 * Functor between categories
 */
export interface Functor {
  readonly name: string;
  readonly sourceCategory: string;
  readonly targetCategory: string;
}

// ============================================================================
// Homotopy Type Theory Types
// ============================================================================

/**
 * Path in HoTT - represents equality/equivalence
 */
export interface Path {
  readonly source: unknown;
  readonly target: unknown;
  readonly type: string;
  readonly proof?: string;
}

/**
 * Value with its type
 */
export interface TypedValue {
  readonly value: unknown;
  readonly type: string;
}

/**
 * Result from HoTT verification
 */
export interface HottResult {
  readonly valid: boolean;
  readonly type: string;
  readonly normalForm: string;
}

// ============================================================================
// Engine Interfaces
// ============================================================================

/**
 * Cohomology Engine interface - Sheaf Laplacian coherence
 */
export interface ICohomologyEngine {
  checkCoherence(vectors: Float32Array[]): Promise<CoherenceResult>;
  computeLaplacianEnergy(sheaf: Sheaf): Promise<number>;
  detectContradictions(vectors: Float32Array[]): Promise<string[]>;
}

/**
 * Spectral Engine interface - stability analysis
 */
export interface ISpectralEngine {
  analyzeStability(matrix: number[][]): Promise<SpectralResult>;
  computeEigenvalues(matrix: number[][] | Float32Array): Promise<number[]>;
  computeSpectralGap(eigenvalues: number[]): number;
  computeStabilityIndex(eigenvalues: number[]): number;
}

/**
 * Causal Engine interface - do-calculus
 */
export interface ICausalEngine {
  infer(intervention: Intervention): Promise<CausalResult>;
  computeDoCalculus(graph: CausalGraph, treatment: string, outcome: string): Promise<CausalEffect>;
  identifyConfounders(graph: CausalGraph, treatment: string, outcome: string): string[];
  findBackdoorPaths(graph: CausalGraph, treatment: string, outcome: string): string[][];
}

/**
 * Quantum Engine interface - topology
 */
export interface IQuantumEngine {
  computeBettiNumbers(complex: SimplicialComplex): Promise<BettiNumbers>;
  persistenceDiagram(filtration: Filtration): Promise<PersistenceDiagram>;
  computeHomologyClasses(complex: SimplicialComplex): Promise<number>;
}

/**
 * Category Engine interface - functors and morphisms
 */
export interface ICategoryEngine {
  applyFunctor(morphism: Morphism): Promise<MorphismResult>;
  compose(f: Morphism, g: Morphism): Promise<Morphism>;
  validateMorphism(source: unknown, target: unknown, morphism: string): boolean;
  isNaturalTransformation(morphism: string): boolean;
}

/**
 * HoTT Engine interface - type theory
 */
export interface IHottEngine {
  checkPathEquivalence(path1: Path, path2: Path): Promise<boolean>;
  transportAlong(path: Path, value: TypedValue): Promise<TypedValue>;
  verifyProof(proposition: string, proof: string): Promise<boolean>;
  inferType(term: string): Promise<string>;
  normalize(term: string): Promise<string>;
}

// ============================================================================
// WASM Bridge Types
// ============================================================================

/**
 * WASM Module interface matching prime-radiant-advanced-wasm
 */
export interface WasmModule {
  // Cohomology functions
  cohomology_compute_energy(vectors: Float32Array, dims: Uint32Array): number;
  cohomology_detect_contradictions(vectors: Float32Array, dims: Uint32Array): Uint8Array;

  // Spectral functions
  spectral_compute_eigenvalues(matrix: Float32Array, n: number): Float32Array;
  spectral_compute_gap(eigenvalues: Float32Array): number;
  spectral_stability_index(eigenvalues: Float32Array): number;

  // Causal functions
  causal_estimate_effect(treatment: number, outcome: number, adjMatrix: Float32Array, n: number): number;
  causal_find_confounders(treatment: number, outcome: number, adjMatrix: Float32Array, n: number): Uint32Array;
  causal_backdoor_paths(treatment: number, outcome: number, adjMatrix: Float32Array, n: number): Uint32Array;

  // Quantum topology functions
  quantum_betti_numbers(points: Float32Array, n: number, dim: number, maxDim: number): Uint32Array;
  quantum_persistence_diagram(points: Float32Array, n: number, dim: number): Float32Array;
  quantum_homology_classes(points: Float32Array, n: number, dim: number, targetDim: number): number;

  // Category theory functions
  category_apply_morphism(sourcePtr: number, morphismId: number): number;
  category_compose(morphismAId: number, morphismBId: number): number;
  category_is_natural(morphismId: number): boolean;

  // HoTT functions
  hott_verify_proof(propositionPtr: number, proofPtr: number): boolean;
  hott_infer_type(termPtr: number): number;
  hott_normalize(termPtr: number): number;
  hott_path_equivalent(path1Ptr: number, path2Ptr: number): boolean;
  hott_transport(pathPtr: number, valuePtr: number): number;

  // Memory management
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  memory: WebAssembly.Memory;
}

/**
 * Configuration for WASM bridge initialization
 */
export interface WasmBridgeConfig {
  wasmPath?: string;
  enableLogging?: boolean;
  cacheSize?: number;
}

/**
 * Status of WASM initialization
 */
export interface WasmStatus {
  initialized: boolean;
  loadTime?: number;
  bundleSize?: number;
  engines: {
    cohomology: boolean;
    spectral: boolean;
    causal: boolean;
    quantum: boolean;
    category: boolean;
    hott: boolean;
  };
}
