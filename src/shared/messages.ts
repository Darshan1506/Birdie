// Message contracts between content.js (x.com) and the background worker.

export interface Source {
  url: string;
  title: string;
}
export interface ChatTurn {
  user: string;
  assistant: string;
}
// What the brain may ask the page to do. "do" is validated by the content script.
export interface BrainAction {
  do: string;
  tweet?: number | string;
  text?: string;
  query?: string;
  goal?: string;
}
// One step of the page agent. Exactly one verb is expected per action.
export interface AgentAction {
  click?: number | string;
  type?: number | string;
  text?: string;
  clear?: boolean;
  press?: string;
  go?: string;
  scroll?: string;
  wait?: number | string;
}
export interface AgentStepRecord {
  actions: AgentAction[];
  results: string[];
}

interface Contract {
  brain: {
    req: { command: string; screen: string; history: ChatTurn[] };
    res: { say: string; actions: BrainAction[] };
  };
  agentStep: {
    req: { goal: string; steps: AgentStepRecord[]; page: string };
    res: { say: string; actions: AgentAction[]; done: boolean };
  };
  research: {
    req: { tweet: string };
    res: { text: string; sources: Source[] };
  };
  transcribe: { req: { audio: string }; res: { text: string } };
  // Lets the page know whether an AI is set up without ever seeing a key.
  status: { req: object; res: { hasAI: boolean; hasGroq: boolean } };
  openOptions: { req: object; res: { ok: true } };
}

export type MessageType = keyof Contract;
export type Message = {
  [K in MessageType]: { type: K } & Contract[K]["req"];
}[MessageType];
export type ErrorResponse = { error: string };
export type Reply<K extends MessageType> = Contract[K]["res"] | ErrorResponse;

export const isError = (r: unknown): r is ErrorResponse =>
  typeof r === "object" && r !== null && "error" in r;
