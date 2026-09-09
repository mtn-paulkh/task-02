import { Component } from './component.js';

/** @typedef {'untouched' | 'valid' | 'invalid'} FieldStatus */

/**
 * @typedef {object} FieldStateDetail
 * @property {string} name
 * @property {FieldStatus} status
 * @property {boolean} submittable
 */

/**
 * @typedef {object} FieldRefs
 * @property {HTMLInputElement | HTMLTextAreaElement} [control]
 * @property {HTMLElement} [errorMessage]
 */

const FIELD_STATE_EVENT = 'custom-form:field-state';
const VALIDATE_EVENT = 'custom-form:validate';
const FOCUS_INVALID_EVENT = 'custom-form:focus-invalid';
const RESET_EVENT = 'custom-form:reset';

/**
 * @param {string} value
 * @returns {string}
 */
function extractDigits(value) {
  return value.replace(/\D/g, '');
}

/**
 * @param {string} mask
 * @returns {number}
 */
function getMaskDigitCount(mask) {
  return (mask.match(/#/g) ?? []).length;
}

/**
 * @param {string} mask
 * @returns {string}
 */
function getMaskPrefix(mask) {
  let prefix = '';

  for (const char of mask) {
    if (char === '#') break;
    prefix += char;
  }

  return prefix;
}

/**
 * @param {string} digits
 * @param {string} mask
 * @returns {string}
 */
function formatWithMask(digits, mask) {
  let result = '';
  let digitIndex = 0;

  for (const char of mask) {
    if (char === '#') {
      if (digitIndex >= digits.length) break;
      result += digits[digitIndex++];
      continue;
    }

    if (digitIndex < digits.length || result.length > 0) {
      result += char;
    }
  }

  return result;
}

/**
 * @param {string} value
 * @param {string} mask
 * @returns {boolean}
 */
function isMaskComplete(value, mask) {
  return extractDigits(value).length === getMaskDigitCount(mask);
}

/**
 * Shared validation and error rendering for form fields.
 *
 * @extends {Component<FieldRefs>}
 */
class CustomFormField extends Component {
  /** @type {FieldStatus} */
  #status = 'untouched';

  /** @type {boolean} */
  #hasShownError = false;

  /** @type {string} */
  #fieldName = '';

  /** @type {HTMLElement | null} */
  #formHost = null;

  /** @type {(event: Event) => void} */
  #boundValidateRequest;

  /** @type {(event: Event) => void} */
  #boundFocusRequest;

  /** @type {() => void} */
  #boundReset;

  /** @type {string} */
  #mask = '';

  /** @type {number} */
  #maskDigitCount = 0;

  constructor() {
    super();
    this.#boundValidateRequest = this.#handleValidateRequest.bind(this);
    this.#boundFocusRequest = this.#handleFocusRequest.bind(this);
    this.#boundReset = this.#handleReset.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#fieldName = this.dataset.name ?? '';
    this.#formHost = this.closest('custom-form');

    const { control } = this.refs;
    control?.addEventListener('blur', this.#handleBlur);
    control?.addEventListener('input', this.#handleInput);
    control?.addEventListener('focus', this.#handleFocus);

    this.#formHost?.addEventListener(VALIDATE_EVENT, this.#boundValidateRequest);
    this.#formHost?.addEventListener(FOCUS_INVALID_EVENT, this.#boundFocusRequest);
    this.#formHost?.addEventListener(RESET_EVENT, this.#boundReset);

    this.#initMask();

    this.#emitState();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    const { control } = this.refs;
    control?.removeEventListener('blur', this.#handleBlur);
    control?.removeEventListener('input', this.#handleInput);
    control?.removeEventListener('focus', this.#handleFocus);

    this.#formHost?.removeEventListener(VALIDATE_EVENT, this.#boundValidateRequest);
    this.#formHost?.removeEventListener(FOCUS_INVALID_EVENT, this.#boundFocusRequest);
    this.#formHost?.removeEventListener(RESET_EVENT, this.#boundReset);
  }

  #initMask() {
    this.#mask = this.dataset.mask?.trim() ?? '';
    this.#maskDigitCount = this.#mask ? getMaskDigitCount(this.#mask) : 0;
  }

  #handleFocus = () => {
    const { control } = this.refs;
    if (!(control instanceof HTMLInputElement) || !this.#mask || control.value) return;

    const prefix = getMaskPrefix(this.#mask);
    if (prefix) {
      control.value = prefix;
    }
  };

  #handleBlur = () => {
    this.#validate({ forceShowError: true });
  };

  #handleInput = () => {
    if (this.#mask && this.refs.control instanceof HTMLInputElement) {
      this.#applyMaskToControl();
      this.#validate({ forceShowError: this.#hasShownError });
      return;
    }

    if (!this.#hasShownError) return;
    this.#validate({ forceShowError: true });
  };

  /**
   * @param {Event} event
   */
  #handleValidateRequest(event) {
    if (event.target !== this.#formHost) return;
    this.#validate({ forceShowError: true });
  }

  /**
   * @param {Event} event
   */
  #handleFocusRequest(event) {
    if (!(event instanceof CustomEvent)) return;
    if (event.detail?.name !== this.#fieldName) return;
    this.refs.control?.focus();
  }

  #handleReset() {
    const { control, errorMessage } = this.refs;
    if (control) control.value = '';
    this.#status = 'untouched';
    this.#hasShownError = false;

    this.#clearErrorUI(errorMessage);
    this.removeAttribute('data-invalid');
    control?.removeAttribute('aria-invalid');
    control?.removeAttribute('aria-describedby');

    this.#emitState();
  }

  #applyMaskToControl() {
    const control = this.refs.control;
    if (!(control instanceof HTMLInputElement) || !this.#mask) return;

    const digits = extractDigits(control.value).slice(0, this.#maskDigitCount);
    const formatted = formatWithMask(digits, this.#mask);

    if (control.value !== formatted) {
      control.value = formatted;
    }
  }

  /**
   * @param {{ forceShowError?: boolean }} [options]
   */
  #validate(options = {}) {
    const { forceShowError = false } = options;
    const { control, errorMessage } = this.refs;
    if (!control) return;

    const message = this.#getValidationMessage(control);

    if (message) {
      this.#status = 'invalid';
      if (forceShowError) {
        this.#hasShownError = true;
        this.#showErrorUI(errorMessage, message, control);
      }
    } else if (control.value.length > 0 || !this.#isRequired()) {
      this.#status = 'valid';
      this.#hasShownError = false;
      this.#clearErrorUI(errorMessage);
      this.removeAttribute('data-invalid');
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
    } else {
      this.#status = 'untouched';
      this.#clearErrorUI(errorMessage);
      this.removeAttribute('data-invalid');
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
    }

    this.#emitState();
  }

  /**
   * @param {HTMLInputElement | HTMLTextAreaElement} control
   * @returns {string}
   */
  #getValidationMessage(control) {
    const value = control.value.trim();
    const label = this.dataset.label || this.#fieldName;
    const minLength = Number(this.dataset.minLength ?? 0);

    if (this.#isRequired() && value.length === 0) {
      return `${label} is required`;
    }

    if (this.#mask && value.length > 0 && !isMaskComplete(value, this.#mask)) {
      return `${label} is incomplete`;
    }

    if (minLength > 0 && value.length > 0 && value.length < minLength) {
      return `${label} must be at least ${minLength} characters`;
    }

    return '';
  }

  /**
   * @returns {boolean}
   */
  #isRequired() {
    return this.dataset.required === 'true';
  }

  /**
   * @returns {boolean}
   */
  #isSubmittable() {
    const { control } = this.refs;
    if (!control) return true;
    return this.#getValidationMessage(control) === '';
  }

  /**
   * @param {HTMLElement | undefined} errorMessage
   * @param {string} message
   * @param {HTMLInputElement | HTMLTextAreaElement} control
   */
  #showErrorUI(errorMessage, message, control) {
    if (!errorMessage) return;

    const errorId = `${this.#fieldName}-error`;
    errorMessage.id = errorId;
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    this.setAttribute('data-invalid', '');
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', errorId);
  }

  /**
   * @param {HTMLElement | undefined} errorMessage
   */
  #clearErrorUI(errorMessage) {
    if (!errorMessage) return;
    errorMessage.textContent = '';
    errorMessage.hidden = true;
    errorMessage.removeAttribute('id');
  }

  #emitState() {
    /** @type {FieldStateDetail} */
    const detail = {
      name: this.#fieldName,
      status: this.#status,
      submittable: this.#isSubmittable(),
    };

    this.dispatchEvent(
      new CustomEvent(FIELD_STATE_EVENT, {
        bubbles: true,
        detail,
      })
    );
  }
}

class CustomInput extends CustomFormField {
  static componentName = 'custom-input';
}

class CustomTextarea extends CustomFormField {
  static componentName = 'custom-textarea';
}

/**
 * @typedef {object} FormRefs
 * @property {HTMLFormElement} [form]
 * @property {HTMLButtonElement} [submitButton]
 * @property {HTMLElement} [successMessage]
 */

/**
 * @extends {Component<FormRefs>}
 */
class CustomForm extends Component {
  static componentName = 'custom-form';

  /** @type {Map<string, FieldStateDetail>} */
  #fieldStates = new Map();

  /** @type {boolean} */
  #isSubmitting = false;

  connectedCallback() {
    super.connectedCallback();
    this.refs.form?.addEventListener('submit', this.#handleSubmit);
    this.addEventListener(FIELD_STATE_EVENT, this.#handleFieldState);
    this.#updateSubmitButton();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.form?.removeEventListener('submit', this.#handleSubmit);
    this.removeEventListener(FIELD_STATE_EVENT, this.#handleFieldState);
  }

  /**
   * @param {Event} event
   */
  #handleFieldState = (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = /** @type {FieldStateDetail} */ (event.detail);
    if (!detail?.name) return;
    this.#fieldStates.set(detail.name, detail);
    this.#updateSubmitButton();
  };

  /**
   * @param {SubmitEvent} event
   */
  #handleSubmit = async (event) => {
    event.preventDefault();

    this.refs.successMessage?.setAttribute('hidden', '');

    this.dispatchEvent(
      new CustomEvent(VALIDATE_EVENT, {
        bubbles: true,
      })
    );

    const invalidFields = [...this.#fieldStates.values()].filter((state) => !state.submittable);

    if (invalidFields.length > 0) {
      const firstInvalid = [...this.#fieldStates.entries()].find(([, state]) => !state.submittable);
      if (firstInvalid) {
        this.dispatchEvent(
          new CustomEvent(FOCUS_INVALID_EVENT, {
            bubbles: true,
            detail: { name: firstInvalid[0] },
          })
        );
      }
      return;
    }

    this.#isSubmitting = true;
    this.#updateSubmitButton();

    const mockResponse = this.dataset.mockResponse ?? 'success';
    const errorMessage = this.dataset.errorMessage ?? 'Something went wrong. Please try again.';

    await new Promise((resolve) => setTimeout(resolve, 400));

    if (mockResponse === 'error') {
      alert(errorMessage);
    } else {
      const successMessage = this.refs.successMessage;
      if (successMessage) {
        successMessage.removeAttribute('hidden');
      }
      this.dispatchEvent(
        new CustomEvent(RESET_EVENT, {
          bubbles: true,
        })
      );
      this.refs.form?.reset();
    }

    this.#isSubmitting = false;
    this.#updateSubmitButton();
  };

  #updateSubmitButton() {
    const submitButton = this.refs.submitButton;
    if (!submitButton) return;

    const hasFields = this.#fieldStates.size > 0;
    const allSubmittable = hasFields && [...this.#fieldStates.values()].every((state) => state.submittable);

    submitButton.disabled = !allSubmittable || this.#isSubmitting;
  }
}

if (!customElements.get(CustomInput.componentName)) {
  customElements.define(CustomInput.componentName, CustomInput);
}

if (!customElements.get(CustomTextarea.componentName)) {
  customElements.define(CustomTextarea.componentName, CustomTextarea);
}

if (!customElements.get(CustomForm.componentName)) {
  customElements.define(CustomForm.componentName, CustomForm);
}
