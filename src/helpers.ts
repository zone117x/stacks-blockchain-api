import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as winston from 'winston';
import { c32addressDecode } from 'c32check';

export const isDevEnv = process.env.NODE_ENV === 'development';
export const isTestEnv = process.env.NODE_ENV === 'test';
export const isProdEnv =
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'prod' ||
  !process.env.NODE_ENV ||
  (!isTestEnv && !isDevEnv);

export const APP_DIR = __dirname;
export const REPO_DIR = path.dirname(__dirname);

function createEnumChecker<T extends string, TEnumValue extends number>(
  enumVariable: { [key in T]: TEnumValue }
): (value: number) => value is TEnumValue {
  // Create a set of valid enum number values.
  const enumValues = Object.values<number>(enumVariable).filter(v => typeof v === 'number');
  const enumValueSet = new Set<number>(enumValues);
  return (value: number): value is TEnumValue => enumValueSet.has(value);
}

const enumCheckFunctions = new Map<object, (value: number) => boolean>();

/**
 * Type guard to check if a given value is a valid enum value.
 * @param enumVariable - Literal `enum` type.
 * @param value - A value to check against the enum's values.
 * @example
 * ```ts
 * enum Color {
 *   Purple = 3,
 *   Orange = 5
 * }
 * const val: number = 3;
 * if (isEnum(Color, val)) {
 *   // `val` is known as enum type `Color`, e.g.:
 *   const colorVal: Color = val;
 * }
 * ```
 */
export function isEnum<T extends string, TEnumValue extends number>(
  enumVariable: { [key in T]: TEnumValue },
  value: number
): value is TEnumValue {
  const checker = enumCheckFunctions.get(enumVariable);
  if (checker !== undefined) {
    return checker(value);
  }
  const newChecker = createEnumChecker(enumVariable);
  enumCheckFunctions.set(enumVariable, newChecker);
  return isEnum(enumVariable, value);
}

export function parseEnum<T extends string, TEnumValue extends number>(
  enumVariable: { [key in T]: TEnumValue },
  num: number,
  invalidEnumErrorFormatter?: (val: number) => Error
): TEnumValue {
  if (isEnum(enumVariable, num)) {
    return num;
  } else if (invalidEnumErrorFormatter !== undefined) {
    throw invalidEnumErrorFormatter(num);
  } else {
    throw new Error(`Failed to parse enum from value "${num}".`);
  }
}

const enumMaps = new Map<object, Map<unknown, unknown>>();

export function getEnumDescription<T extends string, TEnumValue extends number>(
  enumVariable: { [key in T]: TEnumValue },
  value: number
): string {
  const enumMap = enumMaps.get(enumVariable);
  if (enumMap !== undefined) {
    const enumKey = enumMap.get(value);
    if (enumKey !== undefined) {
      return `${value} '${enumKey}'`;
    } else {
      return `${value}`;
    }
  }

  // Create a map of `[enumValue: number]: enumNameString`
  const enumValues = Object.entries(enumVariable)
    .filter(([, v]) => typeof v === 'number')
    .map<[number, string]>(([k, v]) => [v as number, k]);
  const newEnumMap = new Map(enumValues);
  enumMaps.set(enumVariable, newEnumMap);
  return getEnumDescription(enumVariable, value);
}

let didLoadDotEnv = false;

export function loadDotEnv(): void {
  if (didLoadDotEnv) {
    return;
  }
  const dotenvConfig = dotenv.config();
  if (dotenvConfig.error) {
    logError(`Error loading .env file: ${dotenvConfig.error}`, dotenvConfig.error);
    throw dotenvConfig.error;
  }
  didLoadDotEnv = true;
}

export const logger = winston.createLogger({
  level: isDevEnv || isTestEnv ? 'debug' : 'verbose',
  exitOnError: false,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.errors({ stack: true })
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
    }),
  ],
});

export function logError(message: string, error?: Error) {
  if (isDevEnv) {
    console.error(message);
    if (error) {
      console.error(error);
    }
  } else {
    if (error) {
      logger.error(message, error);
    } else {
      logger.error(message);
    }
  }
}

export function formatMapToObject<TKey extends string, TValue, TFormatted>(
  map: Map<TKey, TValue>,
  formatter: (value: TValue) => TFormatted
): Record<TKey, TFormatted> {
  const obj = {} as Record<TKey, TFormatted>;
  for (const [key, value] of map) {
    obj[key] = formatter(value);
  }
  return obj;
}

export function digestSha512_256(input: Buffer): Buffer {
  const hash = crypto.createHash('sha512-256');
  const digest = hash.update(input).digest();
  return digest;
}

export function isValidC32Address(stxAddress: string): boolean {
  try {
    c32addressDecode(stxAddress);
    return true;
  } catch (error) {
    return false;
  }
}

function isValidContractName(contractName: string): boolean {
  const CONTRACT_MIN_NAME_LENGTH = 5;
  const CONTRACT_MAX_NAME_LENGTH = 128;
  if (
    contractName.length > CONTRACT_MAX_NAME_LENGTH ||
    contractName.length < CONTRACT_MIN_NAME_LENGTH
  ) {
    return false;
  }
  const contractNameRegex = /^[a-zA-Z]([a-zA-Z0-9]|[-_])*$/;
  return contractNameRegex.test(contractName);
}

export function isValidPrincipal(
  principal: string
): false | { type: 'standardAddress' | 'contractAddress' } {
  if (!principal || typeof principal !== 'string') {
    return false;
  }
  if (principal.includes('.')) {
    const [addr, contractName] = principal.split('.');
    if (!isValidC32Address(addr)) {
      return false;
    }
    if (!isValidContractName(contractName)) {
      return false;
    }
    return { type: 'contractAddress' };
  } else {
    if (isValidC32Address(principal)) {
      return { type: 'standardAddress' };
    }
  }
  return false;
}

export function parsePort(portVal: number | string | undefined): number | undefined {
  if (portVal === undefined) {
    return undefined;
  }
  if (/^[-+]?(\d+|Infinity)$/.test(portVal.toString())) {
    const port = Number(portVal);
    if (port < 1 || port > 65535) {
      throw new Error(`Port ${port} is invalid`);
    }
    return port;
  } else {
    throw new Error(`Port ${portVal} is invalid`);
  }
}

/** Converts a unix timestamp (in seconds) to an ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) string */
export function unixEpochToIso(timestamp: number): string {
  try {
    const date = new Date(timestamp * 1000);
    const iso = date.toISOString();
    return iso;
  } catch (error) {
    throw error;
  }
}

export function getCurrentGitTag(): string {
  const tagEnvVar = (process.env.GIT_TAG || '').trim();
  if (tagEnvVar) {
    return tagEnvVar;
  }

  if (!isDevEnv && !isTestEnv) {
    if (!tagEnvVar) {
      const error =
        'Production requires the GIT_TAG env var to be set. Set `NODE_ENV=development` to use the current git tag';
      console.error(error);
      throw new Error(error);
    }
    return tagEnvVar;
  }

  try {
    const gitTag = (execSync('git tag --points-at HEAD', { encoding: 'utf8' }) ?? '').trim();
    const gitCommit = (execSync('git rev-parse --short HEAD', { encoding: 'utf8' }) ?? '').trim();
    const result = gitTag || gitCommit;
    if (!result) {
      throw new Error('no git tag or commit hash available');
    }
    return result;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/** JSON.stringify with support for bigint types. */
export function jsonStringify(obj: object): string {
  const stringified = JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'bigint') {
      return '0x' + value.toString(16);
    }
    return value;
  });
  return stringified;
}

/** Encodes a buffer as a `0x` prefixed lower-case hex string. */
export function bufferToHexPrefixString(buff: Buffer): string {
  return '0x' + buff.toString('hex');
}

/**
 * Decodes a `0x` prefixed hex string to a buffer.
 * @param hex - A hex string with a `0x` prefix.
 */
export function hexToBuffer(hex: string): Buffer {
  if (!hex.startsWith('0x')) {
    throw new Error(`Hex string is missing the "0x" prefix: "${hex}"`);
  }
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex string is an odd number of digits: ${hex}`);
  }
  return Buffer.from(hex.substring(2), 'hex');
}

export function assertNotNullish<T>(val: T, onNullish?: () => string): Exclude<T, undefined> {
  if (val === undefined) {
    throw new Error(onNullish?.() ?? 'value is undefined');
  }
  if (val === null) {
    throw new Error(onNullish?.() ?? 'value is null');
  }
  return val as Exclude<T, undefined>;
}

export function getOrAdd<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let val = map.get(key);
  if (val === undefined) {
    val = create();
    map.set(key, val);
  }
  return val;
}

export async function getOrAddAsync<K, V>(
  map: Map<K, V>,
  key: K,
  create: () => PromiseLike<V>
): Promise<V> {
  let val = map.get(key);
  if (val === undefined) {
    val = await create();
    map.set(key, val);
  }
  return val;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ElementType<T extends any[]> = T extends (infer U)[] ? U : never;

export type FoundOrNot<T> = { found: true; result: T } | { found: false };

export function timeout(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

export type Waiter<T> = Promise<T> & {
  finish: (result: T) => void;
  isFinished: boolean;
};

export function waiter<T = void>(): Waiter<T> {
  let resolveFn: (result: T) => void;
  const promise = new Promise<T>(resolve => {
    resolveFn = resolve;
  });
  const completer = {
    finish: (result: T) => {
      completer.isFinished = true;
      resolveFn(result);
    },
    isFinished: false,
  };
  return Object.assign(promise, completer);
}

export function stopwatch(): {
  /** Milliseconds since stopwatch was created. */
  getElapsed: () => number;
} {
  const start = process.hrtime();
  return {
    getElapsed: () => {
      const hrend = process.hrtime(start);
      return hrend[0] * 1000 + hrend[1] / 1000000;
    },
  };
}

export async function time<T>(
  fn: () => Promise<T>,
  onFinish: (elapsedMs: number) => void
): Promise<T> {
  const watch = stopwatch();
  try {
    return await fn();
  } finally {
    onFinish(watch.getElapsed());
  }
}

export type Json = string | number | boolean | null | { [property: string]: Json } | Json[];

/**
 * Escape a string for use as a css selector name.
 * From https://github.com/mathiasbynens/CSS.escape/blob/master/css.escape.js
 */
export function cssEscape(value: string): string {
  const string = value;
  const length = string.length;
  let index = -1;
  let codeUnit: number;
  let result = '';
  const firstCodeUnit = string.charCodeAt(0);
  while (++index < length) {
    codeUnit = string.charCodeAt(index);
    // Note: there’s no need to special-case astral symbols, surrogate
    // pairs, or lone surrogates.

    // If the character is NULL (U+0000), then the REPLACEMENT CHARACTER
    // (U+FFFD).
    if (codeUnit == 0x0000) {
      result += '\uFFFD';
      continue;
    }

    if (
      // If the character is in the range [\1-\1F] (U+0001 to U+001F) or is
      // U+007F, […]
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit == 0x007f ||
      // If the character is the first character and is in the range [0-9]
      // (U+0030 to U+0039), […]
      (index == 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      // If the character is the second character and is in the range [0-9]
      // (U+0030 to U+0039) and the first character is a `-` (U+002D), […]
      (index == 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit == 0x002d)
    ) {
      // https://drafts.csswg.org/cssom/#escape-a-character-as-code-point
      result += '\\' + codeUnit.toString(16) + ' ';
      continue;
    }

    if (
      // If the character is the first character and is a `-` (U+002D), and
      // there is no second character, […]
      index == 0 &&
      length == 1 &&
      codeUnit == 0x002d
    ) {
      result += '\\' + string.charAt(index);
      continue;
    }

    // If the character is not handled by one of the above rules and is
    // greater than or equal to U+0080, is `-` (U+002D) or `_` (U+005F), or
    // is in one of the ranges [0-9] (U+0030 to U+0039), [A-Z] (U+0041 to
    // U+005A), or [a-z] (U+0061 to U+007A), […]
    if (
      codeUnit >= 0x0080 ||
      codeUnit == 0x002d ||
      codeUnit == 0x005f ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007a)
    ) {
      // the character itself
      result += string.charAt(index);
      continue;
    }

    // Otherwise, the escaped character.
    // https://drafts.csswg.org/cssom/#escape-a-character
    result += '\\' + string.charAt(index);
  }
  return result;
}

export const has0xPrefix = (id: string) => id.substr(0, 2).toLowerCase() === '0x';

/**
 * Check if the input is a valid 32-byte hex string. If valid, returns a
 * lowercase and 0x-prefixed hex string. If invalid, returns false.
 */
export function normalizeHashString(input: string): string | false {
  if (typeof input !== 'string') {
    return false;
  }
  let hashBuffer: Buffer | undefined;
  if (input.length === 66 && has0xPrefix(input)) {
    hashBuffer = Buffer.from(input.slice(2), 'hex');
  } else if (input.length === 64) {
    hashBuffer = Buffer.from(input, 'hex');
  }
  if (hashBuffer === undefined || hashBuffer.length !== 32) {
    return false;
  }
  return `0x${hashBuffer.toString('hex')}`;
}
