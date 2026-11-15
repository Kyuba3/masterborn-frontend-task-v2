import { ERROR_CODES, type ErrorCode } from '../components/ProductConfigurator/types';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.PRICE_CALC_FAILED]:
    'We couldn’t calculate your price. Change an option to try again.',
  [ERROR_CODES.NETWORK_TIMEOUT]:
    'The price calculation took too long. Check your connection, then change an option to try again.',
  [ERROR_CODES.VALIDATION_CONFLICT]:
    'Some selected options don’t work together. Review your selections and try again.',
  [ERROR_CODES.INVALID_QUANTITY]: 'Choose a quantity of at least 1 and try again.',
  [ERROR_CODES.DEPENDENCY_MISSING]:
    'This add-on requires another option. Select the required option first, then try again.',
  [ERROR_CODES.UNKNOWN]:
    'Something went wrong. Please try again. If it continues, contact support.',
};

const CONTEXT_MESSAGES = {
  validation: 'We couldn’t check your configuration. Change an option to try again.',
  saveDraft: 'We couldn’t save your draft. Please try saving it again.',
  loadDraft: 'We couldn’t load that draft. Try again or choose another saved draft.',
  listDrafts: 'We couldn’t retrieve your drafts. Close and reopen Drafts to try again.',
  deleteDraft: 'We couldn’t delete that draft. Please try deleting it again.',
  clipboard: 'We couldn’t copy the link. Select the link and copy it manually.',
};

export interface ConfiguratorError {
  code: string;
  message?: string;
  context?: keyof typeof CONTEXT_MESSAGES;
}

/** Translate identifiers at the UI boundary; keep the original code in state. */
export function getErrorMessage({ code, message, context }: ConfiguratorError): string {
  // Validation messages already explain specific problems. Never echo code-only
  // messages or technical identifiers embedded in otherwise readable text.
  if (
    message?.trim() &&
    !message.includes(code) &&
    !/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/.test(message)
  ) {
    return message;
  }

  if (code !== ERROR_CODES.UNKNOWN && Object.hasOwn(ERROR_MESSAGES, code)) {
    return ERROR_MESSAGES[code as ErrorCode];
  }

  return context ? CONTEXT_MESSAGES[context] : ERROR_MESSAGES[ERROR_CODES.UNKNOWN];
}
