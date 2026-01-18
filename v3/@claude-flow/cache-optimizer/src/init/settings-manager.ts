/**
 * @claude-flow/cache-optimizer - Settings Manager
 *
 * Manages .claude/settings.json for hook integration.
 * Handles reading, merging, and writing hook configurations.
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { constants } from 'fs';
import type { HookConfiguration, HookEntry, Profile } from './profiles.js';

/**
 * Claude Code settings.json structure
 */
export interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    [key: string]: unknown;
  };
  hooks?: {
    UserPromptSubmit?: HookEntry[];
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    PreCompact?: HookEntry[];
    MessageComplete?: HookEntry[];
    [key: string]: HookEntry[] | undefined;
  };
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SettingsManagerConfig {
  /** Project root path (defaults to cwd) */
  projectRoot?: string;
  /** Path to settings.json relative to project root */
  settingsPath?: string;
  /** Backup existing settings before modification */
  backup?: boolean;
  /** Merge with existing hooks (vs replace) */
  merge?: boolean;
}

const DEFAULT_CONFIG: Required<SettingsManagerConfig> = {
  projectRoot: process.cwd(),
  settingsPath: '.claude/settings.json',
  backup: true,
  merge: true,
};

/**
 * Settings Manager for .claude/settings.json
 */
export class SettingsManager {
  private config: Required<SettingsManagerConfig>;
  private settingsFullPath: string;

  constructor(config?: SettingsManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.settingsFullPath = join(this.config.projectRoot, this.config.settingsPath);
  }

  /**
   * Check if settings file exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.settingsFullPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read current settings
   */
  async read(): Promise<ClaudeSettings> {
    try {
      const content = await readFile(this.settingsFullPath, 'utf8');
      return JSON.parse(content) as ClaudeSettings;
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        return {}; // No settings file yet
      }
      throw error;
    }
  }

  /**
   * Write settings to file
   */
  async write(settings: ClaudeSettings): Promise<void> {
    // Ensure directory exists
    await mkdir(dirname(this.settingsFullPath), { recursive: true });

    // Backup if requested and file exists
    if (this.config.backup && await this.exists()) {
      const backupPath = `${this.settingsFullPath}.backup.${Date.now()}`;
      const currentContent = await readFile(this.settingsFullPath, 'utf8');
      await writeFile(backupPath, currentContent);
    }

    // Write new settings
    await writeFile(this.settingsFullPath, JSON.stringify(settings, null, 2) + '\n');
  }

  /**
   * Apply hook configuration from profile
   */
  async applyProfile(profile: Profile): Promise<{ updated: boolean; changes: string[] }> {
    const current = await this.read();
    const changes: string[] = [];

    // Initialize hooks if not present
    if (!current.hooks) {
      current.hooks = {};
      changes.push('Created hooks section');
    }

    // Apply each hook type
    const hookTypes = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PreCompact', 'MessageComplete'] as const;

    for (const hookType of hookTypes) {
      const profileHooks = profile.hooks[hookType];
      if (!profileHooks || profileHooks.length === 0) continue;

      if (this.config.merge && current.hooks[hookType]) {
        // Merge: add profile hooks that don't already exist
        const existingCommands = new Set(current.hooks[hookType]!.map(h => h.command));
        const newHooks = profileHooks.filter(h => !existingCommands.has(h.command));

        if (newHooks.length > 0) {
          current.hooks[hookType] = [...current.hooks[hookType]!, ...newHooks];
          changes.push(`Added ${newHooks.length} hook(s) to ${hookType}`);
        }
      } else {
        // Replace
        current.hooks[hookType] = profileHooks;
        changes.push(`Set ${hookType} hooks (${profileHooks.length} entries)`);
      }
    }

    if (changes.length > 0) {
      await this.write(current);
      return { updated: true, changes };
    }

    return { updated: false, changes: [] };
  }

  /**
   * Apply custom hook configuration
   */
  async applyHooks(hooks: HookConfiguration): Promise<{ updated: boolean; changes: string[] }> {
    const current = await this.read();
    const changes: string[] = [];

    if (!current.hooks) {
      current.hooks = {};
      changes.push('Created hooks section');
    }

    for (const [hookType, hookEntries] of Object.entries(hooks)) {
      if (!hookEntries || hookEntries.length === 0) continue;

      if (this.config.merge && current.hooks[hookType]) {
        const existingCommands = new Set(current.hooks[hookType]!.map(h => h.command));
        const newHooks = hookEntries.filter((h: HookEntry) => !existingCommands.has(h.command));

        if (newHooks.length > 0) {
          current.hooks[hookType] = [...current.hooks[hookType]!, ...newHooks];
          changes.push(`Added ${newHooks.length} hook(s) to ${hookType}`);
        }
      } else {
        current.hooks[hookType] = hookEntries;
        changes.push(`Set ${hookType} hooks (${hookEntries.length} entries)`);
      }
    }

    if (changes.length > 0) {
      await this.write(current);
      return { updated: true, changes };
    }

    return { updated: false, changes: [] };
  }

  /**
   * Remove cache-optimizer hooks
   */
  async removeHooks(): Promise<{ updated: boolean; removed: number }> {
    const current = await this.read();
    let removed = 0;

    if (!current.hooks) {
      return { updated: false, removed: 0 };
    }

    for (const hookType of Object.keys(current.hooks)) {
      const hooks = current.hooks[hookType];
      if (!hooks) continue;

      const originalLength = hooks.length;
      current.hooks[hookType] = hooks.filter(h => !h.command.includes('@claude-flow/cache-optimizer'));
      removed += originalLength - current.hooks[hookType]!.length;
    }

    if (removed > 0) {
      await this.write(current);
      return { updated: true, removed };
    }

    return { updated: false, removed: 0 };
  }

  /**
   * Get current cache-optimizer hooks
   */
  async getCacheOptimizerHooks(): Promise<HookConfiguration> {
    const current = await this.read();
    const result: HookConfiguration = {};

    if (!current.hooks) {
      return result;
    }

    for (const [hookType, hooks] of Object.entries(current.hooks)) {
      if (!hooks) continue;
      const cacheHooks = hooks.filter(h => h.command.includes('@claude-flow/cache-optimizer'));
      if (cacheHooks.length > 0) {
        result[hookType as keyof HookConfiguration] = cacheHooks;
      }
    }

    return result;
  }

  /**
   * Validate current settings
   */
  async validate(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const settings = await this.read();

      // Check hooks structure
      if (settings.hooks) {
        for (const [hookType, hooks] of Object.entries(settings.hooks)) {
          if (!hooks) continue;

          if (!Array.isArray(hooks)) {
            errors.push(`${hookType} should be an array`);
            continue;
          }

          for (let i = 0; i < hooks.length; i++) {
            const hook = hooks[i];
            if (!hook.command || typeof hook.command !== 'string') {
              errors.push(`${hookType}[${i}] missing command`);
            }
            if (hook.timeout && typeof hook.timeout !== 'number') {
              warnings.push(`${hookType}[${i}] timeout should be a number`);
            }
          }
        }
      }

      // Check for cache-optimizer hooks
      const cacheHooks = await this.getCacheOptimizerHooks();
      if (Object.keys(cacheHooks).length === 0) {
        warnings.push('No cache-optimizer hooks found');
      }

      return { valid: errors.length === 0, errors, warnings };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to read settings: ${error}`],
        warnings: [],
      };
    }
  }

  /**
   * Get settings file path
   */
  getPath(): string {
    return this.settingsFullPath;
  }
}

/**
 * Create settings manager with default config
 */
export function createSettingsManager(config?: SettingsManagerConfig): SettingsManager {
  return new SettingsManager(config);
}
