type ToolLogger = (message: string) => void;

const defaultLogger: ToolLogger = (message: string) => {
  console.log(message);
};

let activeLogger: ToolLogger = defaultLogger;

export function setToolLogger(logger?: ToolLogger): void {
  activeLogger = logger ?? defaultLogger;
}

export function logToolMessage(message: string): void {
  activeLogger(message);
}
