type ToolLogger = (message: string) => void;

const defaultLogger: ToolLogger = (message: string) => {
  console.log(message);
};

let activeLogger: ToolLogger = defaultLogger;

/**
 * Overrides the logger used by tool execution so UIs can mute or capture output.
 * Pass no argument to restore the default console-based logger.
 * @param logger Optional callback that receives log lines.
 */
export function setToolLogger(logger?: ToolLogger): void {
  activeLogger = logger ?? defaultLogger;
}

/**
 * Emits a message through the currently active tool logger.
 * Internal helpers and tools should call this instead of console logging directly.
 * @param message Human readable log text.
 */
export function logToolMessage(message: string): void {
  activeLogger(message);
}
