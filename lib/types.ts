export type InputType = 'radio_grid' | 'radio_list' | 'checkbox' | 'text' | 'select' | 'unknown';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface StagedQuestion {
  questionId: string; // 'R028000'
  pageIndex: number;
  prompt: string;
  groupPrompt?: string; // legend text for checkbox groups
  inputType: InputType;
  options: QuestionOption[];
  suggested: string | string[] | null;
  needsUser: boolean;
  required: boolean;
  rawHtml?: string; // for unknown types
}

export interface StageResult {
  stagingSessionId: string;
  receiptId: string;
  pages: number;
  questions: StagedQuestion[];
  terminalButtonLabel: string | null; // e.g. 'Submit' — null if never reached
  expiresAt: string; // ISO; held-session deadline
}

export type ReceiptStatus = 'new' | 'staged' | 'submitted' | 'error';

export interface ReceiptItem {
  qty: number;
  name: string;
  price: number;
}

export interface Receipt {
  id: string;
  createdAt: string;
  updatedAt: string;
  imagePath: string;
  ocrRawText: string | null;
  surveyCode: string | null;
  storeNumber: string | null;
  registerNumber: string | null;
  visitDate: string | null;
  visitTime: string | null;
  orderNumber: string | null;
  totalAmount: number | null;
  items: ReceiptItem[];
  status: ReceiptStatus;
  validationCode: string | null;
  submittedAt: string | null;
  replayAttempts: number;
  lastError: string | null;
}

export type RunPhase = 'stage' | 'confirm';
export type RunStatus = 'running' | 'staged' | 'submitted' | 'failed';

export interface SurveyRun {
  id: string;
  receiptId: string;
  phase: RunPhase;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  pageCount: number | null;
  transcript: StagedQuestion[];
  finalPageText: string | null;
  error: string | null;
}

/** Answer values as stored/round-tripped: single value, multi values, or blank. */
export type AnswerValue = string | string[] | null;

/** Receipt metadata parsed from OCR text (all fields best-effort). */
export interface ReceiptMetadata {
  storeNumber: string | null;
  registerNumber: string | null;
  visitDate: string | null;
  visitTime: string | null;
  orderNumber: string | null;
  totalAmount: number | null;
  items: ReceiptItem[];
}

export interface CodeCandidate {
  code: string;
  score: number;
  source: 'grouping' | 'anchor' | 'run';
}

export interface OcrResult {
  rawText: string;
  codeCandidates: CodeCandidate[];
  bestCode: string | null;
  metadata: ReceiptMetadata;
}

/** Parser output for one mcdvoice.com question page. */
export interface ParsedPage {
  questions: StagedQuestion[];
  postedFns: string[];
  submitLabel: string | null;
  progress: string | null;
}

export const SURVEY_ERROR_CODES = [
  'CONFIRMATION_REQUIRED',
  'ALREADY_SUBMITTED',
  'SESSION_EXPIRED',
  'CODE_REJECTED_ON_REPLAY',
  'REPLAY_LIMIT_REACHED',
  'VALIDATION_CODE_NOT_FOUND',
  'INVALID_CODE',
  'STAGE_FAILED',
] as const;

export type SurveyErrorCode = (typeof SURVEY_ERROR_CODES)[number];
