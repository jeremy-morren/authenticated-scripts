export const SCRIPT_TYPES = ['pwsh', 'powershell', 'batch', 'bash'] as const;
export type ScriptType = typeof SCRIPT_TYPES[number];
export type ScriptLocation = 'scriptPath' | 'inlineScript' | 'createVariables';

export interface ScriptSource {
  type: ScriptType;
  value?: string;
  isShorthand: boolean;
}

export interface ServiceConnection {
  url: string;
  username: string;
  password: string;
}

export interface CommandSpec {
  command: string;
  args: string[];
}

export type ShorthandInputs = Partial<Record<ScriptType, string | undefined>>;

export function serviceConnectionEnvironment(connection: ServiceConnection): NodeJS.ProcessEnv {
  return {
    AS_SC_URL: connection.url,
    AS_SC_USERNAME: connection.username,
    AS_SC_PASSWORD: connection.password
  };
}

export function commandForScript(type: ScriptType, scriptFile: string): CommandSpec {
  switch (type) {
    case 'bash':
      return { command: 'bash', args: [scriptFile] };
    case 'pwsh':
    case 'powershell':
      return { command: type, args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptFile] };
    case 'batch':
      return { command: scriptFile, args: [] };
  }
}

export function isSingleLine(script: string): boolean {
  return !/[\r\n]/.test(script);
}

export function variableNames(prefix: string): { url: string; username: string; password: string } {
  return {
    url: `${prefix}_URL`,
    username: `${prefix}_USERNAME`,
    password: `${prefix}_PASSWORD`
  };
}

/** Finds the one YAML shorthand, while rejecting ambiguous combinations. */
export function resolveScriptSource(
  location: Exclude<ScriptLocation, 'createVariables'>,
  explicitType: string | undefined,
  scriptFile: string | undefined,
  inlineScript: string | undefined,
  shorthandValues: ShorthandInputs
): ScriptSource {
  const shorthand = SCRIPT_TYPES
    .filter(type => Boolean(shorthandValues[type]))
    .map(type => ({ type, value: shorthandValues[type] as string }));

  if (shorthand.length > 1) {
    throw new Error(`Specify at most one script shorthand: ${SCRIPT_TYPES.join(', ')}.`);
  }
  if (explicitType && !SCRIPT_TYPES.includes(explicitType as ScriptType)) {
    throw new Error(`Unsupported scriptType '${explicitType}'.`);
  }
  if (shorthand.length === 1) {
    if (scriptFile || inlineScript) {
      throw new Error('Specify either a script shorthand or scriptFile/inlineScript, not both.');
    }
    const selected = shorthand[0];
    if (explicitType && explicitType !== selected.type) {
      throw new Error(`scriptType '${explicitType}' does not match the '${selected.type}' shorthand.`);
    }
    return { type: selected.type, value: selected.value, isShorthand: true };
  }

  return {
    type: (explicitType as ScriptType | undefined) || 'pwsh',
    value: location === 'scriptPath' ? scriptFile : inlineScript,
    isShorthand: false
  };
}
