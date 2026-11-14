/**
 * ProductConfigurator Component
 *
 * The main configurator widget for customizing products.
 * This component handles all product configuration logic including:
 * - Option selection (dropdowns, colors, toggles)
 * - Quantity management
 * - Add-on selection
 * - Price calculation
 * - Draft saving/loading
 * - Share URL generation
 *
 * Author: Marcus (no longer with company)
 * Last updated: 2 weeks ago
 *
 * Known issues:
 * - "Some timing stuff with prices, meant to fix" - Marcus
 * - "Resize handler might have a leak" - Marcus
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react';
import type {
  Product,
  ProductOption,
  AddOn,
  Configuration,
  PriceBreakdown,
  Draft,
  ValidationResult,
} from './types';
import { ERROR_CODES } from './types';
import { usePriceCalculation } from '../../hooks/usePriceCalculation';
import {
  validateConfiguration,
  saveDraft,
  loadDraft,
  getAllDrafts,
  deleteDraft,
  encodeConfigurationToUrl,
  decodeConfigurationFromUrl,
  generatePreview,
} from '../../services/api';
import {
  formatPrice,
  getAppliedDiscountPercentage,
  getNextDiscountTier,
} from '../../utils/pricing';
import './styles.css';

interface ProductConfiguratorProps {
  product: Product;
  initialConfiguration?: Partial<Configuration>;
  onConfigurationChange?: (config: Configuration) => void;
  onAddToCart?: (config: Configuration, price: PriceBreakdown) => void;
  readOnly?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const generateConfigId = (): string => {
  return `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const getDefaultSelections = (product: Product): Record<string, string | number | boolean> => {
  const selections: Record<string, string | number | boolean> = {};

  for (const option of product.options) {
    if (option.defaultValue !== undefined) {
      selections[option.id] = option.defaultValue;
    } else if (option.choices && option.choices.length > 0) {
      const firstAvailable = option.choices.find((c) => c.available);
      if (firstAvailable) {
        selections[option.id] = firstAvailable.value;
      }
    }
  }

  return selections;
};

const isAddOnAvailable = (
  addOn: AddOn,
  selections: Record<string, string | number | boolean>,
): boolean => {
  if (!addOn.dependsOn) return true;

  const dependencyValue = selections[addOn.dependsOn.optionId];
  return dependencyValue === addOn.dependsOn.requiredValue;
};

const getOptionState = (
  product: Product,
  selections: Configuration['selections'],
  selectedAddOns: string[],
) => ({
  selections,
  selectedAddOns: selectedAddOns.filter((id) => {
    const addOn = product.addOns.find((candidate) => candidate.id === id);
    return addOn !== undefined && isAddOnAvailable(addOn, selections);
  }),
});

const formatTimestamp = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString();
};

const calculateColorColumns = (
  containerWidth: number,
  swatchSize: number = 36,
  gap: number = 8,
): number => {
  const columns = Math.floor((containerWidth + gap) / (swatchSize + gap));
  return Math.max(1, columns);
};

// ============================================================================
// Main Component
// ============================================================================

export const ProductConfigurator: React.FC<ProductConfiguratorProps> = ({
  product,
  initialConfiguration,
  onConfigurationChange,
  onAddToCart,
  readOnly = false,
}) => {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [{ selections, selectedAddOns }, setOptionState] = useState(() =>
    getOptionState(
      product,
      initialConfiguration?.selections || getDefaultSelections(product),
      initialConfiguration?.addOns || [],
    ),
  );

  const [quantity, setQuantity] = useState<number>(() => initialConfiguration?.quantity || 1);

  const [configId] = useState<string>(() => initialConfiguration?.id || generateConfigId());

  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftName, setDraftName] = useState('');
  const [configurationName, setConfigurationName] = useState(initialConfiguration?.name);

  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const [validationState, setValidationState] = useState<{
    request: { config: Configuration; product: Product };
    result: ValidationResult | null;
    error: string | null;
  } | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string>(product.imageUrl);

  const [error, setError] = useState<string | null>(null);

  const accessibilityId = useId();
  const modalRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  // Shared URLs are restored once against the product supplied at mount.
  const initialProductRef = useRef(product);

  // -------------------------------------------------------------------------
  // Derived State
  // -------------------------------------------------------------------------

  // Names are metadata; editing them must not invalidate price or validation results.
  const calculationConfig: Configuration = useMemo(
    () => ({
      id: configId,
      productId: product.id,
      selections,
      addOns: selectedAddOns,
      quantity,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [configId, product.id, selections, selectedAddOns, quantity],
  );
  const currentConfig = useMemo(
    () => ({ ...calculationConfig, name: configurationName }),
    [calculationConfig, configurationName],
  );
  const shareUrl = useMemo(() => {
    if (!showShareModal) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('config', encodeConfigurationToUrl(currentConfig));
    return url.toString();
  }, [showShareModal, currentConfig]);

  const {
    price,
    formattedTotal,
    isLoading: isPriceLoading,
    error: priceError,
  } = usePriceCalculation(calculationConfig, product);

  const validationRequest = useMemo(
    () => ({ config: calculationConfig, product }),
    [calculationConfig, product],
  );
  const currentValidation = validationState?.request === validationRequest ? validationState : null;
  const validation = currentValidation?.result;
  const validationError = currentValidation?.error;
  const canAddToCart =
    !readOnly && validation?.valid === true && price !== null && !isPriceLoading && !priceError;

  const appliedDiscount = getAppliedDiscountPercentage(quantity);
  const nextTier = getNextDiscountTier(quantity);

  const availableAddOns = useMemo(() => {
    const map = new Map<string, AddOn>();
    for (const addOn of product.addOns) {
      if (isAddOnAvailable(addOn, selections)) {
        map.set(addOn.id, addOn);
      }
    }
    return map;
  }, [product.addOns, selections]);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleResize = () => {
      if (colorPickerRef.current) {
        const width = colorPickerRef.current.offsetWidth;
        const cols = calculateColorColumns(width);
        colorPickerRef.current.style.setProperty('--color-columns', cols.toString());
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      try {
        const result = await validateConfiguration(
          validationRequest.config,
          validationRequest.product,
        );
        if (!cancelled) {
          setValidationState({ request: validationRequest, result, error: null });
        }
      } catch {
        if (!cancelled) {
          setValidationState({
            request: validationRequest,
            result: null,
            error: ERROR_CODES.UNKNOWN,
          });
        }
      }
    };

    validate();

    return () => {
      cancelled = true;
    };
  }, [validationRequest]);

  useEffect(() => {
    let cancelled = false;

    const updatePreview = async () => {
      try {
        const preview = await generatePreview(calculationConfig, product);
        if (!cancelled) {
          setPreviewUrl(preview.imageUrl);
        }
      } catch {
        setPreviewUrl(product.imageUrl);
      }
    };

    updatePreview();

    return () => {
      cancelled = true;
    };
  }, [calculationConfig, product]);

  useEffect(() => {
    if (onConfigurationChange) {
      onConfigurationChange(currentConfig);
    }
  }, [currentConfig, onConfigurationChange]);

  useEffect(() => {
    setIsDirty(true);
  }, [selections, selectedAddOns, quantity]);

  useEffect(() => {
    if (showDraftModal) {
      getAllDrafts().then(setDrafts);
    }
  }, [showDraftModal]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedConfig = params.get('config');

    if (encodedConfig) {
      const decoded = decodeConfigurationFromUrl(encodedConfig, initialProductRef.current);
      if (decoded) {
        setOptionState(
          getOptionState(initialProductRef.current, decoded.selections, decoded.addOns),
        );
        setQuantity(decoded.quantity);
        setConfigurationName(decoded.name);
      }
    }
  }, []);

  useEffect(() => {
    const dialog = modalRef.current;
    if (!dialog) return;

    const trigger = lastFocusedElement.current;
    dialog.showModal();
    dialog.querySelector('input')?.focus();

    // All close paths (including save/load) restore the same opening trigger.
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, [showDraftModal, showShareModal]);

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  const handleOptionChange = useCallback(
    (optionId: string, value: string | number | boolean) => {
      setOptionState((prev) =>
        getOptionState(product, { ...prev.selections, [optionId]: value }, prev.selectedAddOns),
      );
    },
    [product],
  );

  const handleAddOnToggle = useCallback(
    (addOnId: string) => {
      const addOn = product.addOns.find((a) => a.id === addOnId);
      if (!addOn) return;

      if (!isAddOnAvailable(addOn, selections)) {
        setError(ERROR_CODES.DEPENDENCY_MISSING);
        return;
      }

      setOptionState((prev) => {
        // Check the queued state too: an earlier option change may have disabled this add-on.
        if (!isAddOnAvailable(addOn, prev.selections)) return prev;

        return getOptionState(
          product,
          prev.selections,
          prev.selectedAddOns.includes(addOnId)
            ? prev.selectedAddOns.filter((id) => id !== addOnId)
            : [...prev.selectedAddOns, addOnId],
        );
      });
    },
    [product, selections],
  );

  const handleQuantityChange = useCallback(
    (newQuantity: number) => {
      const quantityOption = product.options.find((o) => o.type === 'quantity');
      const min = quantityOption?.min ?? 1;
      const max = quantityOption?.max ?? 999;

      const clampedQuantity = Math.max(min, Math.min(max, newQuantity));
      setQuantity(clampedQuantity);
    },
    [product.options],
  );

  const handleSaveDraft = useCallback(async () => {
    try {
      const name = draftName || currentConfig.name || 'Untitled Draft';
      await saveDraft({ ...currentConfig, name }, name);
      setConfigurationName(name);
      setLastSaved(new Date());
      setIsDirty(false);
      setDraftName('');

      setShowDraftModal(false);
    } catch {
      setError(ERROR_CODES.UNKNOWN);
    }
  }, [currentConfig, draftName]);

  const handleLoadDraft = useCallback(
    async (draftId: string) => {
      try {
        const draft = await loadDraft(draftId);
        if (draft) {
          setOptionState(
            getOptionState(product, draft.configuration.selections, draft.configuration.addOns),
          );
          setQuantity(draft.configuration.quantity);
          setConfigurationName(draft.configuration.name ?? draft.name);
          setShowDraftModal(false);
          setIsDirty(false);
        }
      } catch {
        setError(ERROR_CODES.UNKNOWN);
      }
    },
    [product],
  );

  const handleDeleteDraft = useCallback(async (draftId: string) => {
    try {
      await deleteDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      modalRef.current?.querySelector('input')?.focus();
    } catch {
      setError(ERROR_CODES.UNKNOWN);
    }
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!canAddToCart || !price) {
      if (validation && !validation.valid) {
        setError(validation.errors[0]?.code || ERROR_CODES.UNKNOWN);
      }
      return;
    }

    onAddToCart?.(currentConfig, price);
  }, [canAddToCart, validation, price, currentConfig, onAddToCart]);

  const handleCopyShareUrl = useCallback(() => {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {})
      .catch(() => {
        setError(ERROR_CODES.UNKNOWN);
      });
  }, [shareUrl]);

  const handleModalClose = useCallback((modalType: 'draft' | 'share') => {
    if (modalType === 'draft') {
      setShowDraftModal(false);
    } else {
      setShowShareModal(false);
    }
  }, []);

  const handleModalKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;

    // Native dialogs make the background inert; wrap the boundary explicitly so
    // Tab stays on a dialog control instead of moving to the browser chrome.
    const controls = event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled)',
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const handleDiscardChanges = useCallback(() => {
    setOptionState(getOptionState(product, getDefaultSelections(product), []));
    setQuantity(1);
    setIsDirty(false);
  }, [product]);

  // -------------------------------------------------------------------------
  // Render Helpers
  // -------------------------------------------------------------------------

  const renderSelectOption = (option: ProductOption) => {
    const currentValue = selections[option.id] as string;

    return (
      <div className="option-group" key={option.id}>
        <label className="option-label" htmlFor={`option-${option.id}`}>
          {option.name}
          {option.required && <span className="required">*</span>}
        </label>
        <select
          id={`option-${option.id}`}
          className="option-select"
          value={currentValue || ''}
          onChange={(e) => handleOptionChange(option.id, e.target.value)}
          disabled={readOnly}
        >
          {option.choices?.map((choice) => (
            <option key={choice.id} value={choice.value} disabled={!choice.available}>
              {choice.label}
              {choice.priceModifier !== 0 &&
                ` (${choice.priceModifier > 0 ? '+' : ''}${formatPrice(choice.priceModifier, product.currency)})`}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderColorOption = (option: ProductOption) => {
    const currentValue = selections[option.id] as string;

    return (
      <div className="option-group" key={option.id}>
        <div className="option-label">
          {option.name}
          {option.required && <span className="required">*</span>}
        </div>
        <div
          className="color-picker"
          ref={colorPickerRef}
          role="radiogroup"
          aria-label={option.name}
        >
          {option.choices?.map((choice) => (
            <label
              key={choice.id}
              className={`color-swatch ${currentValue === choice.value ? 'selected' : ''}`}
              style={{ backgroundColor: choice.colorHex }}
              title={choice.label}
            >
              <input
                type="radio"
                className="swatch-input"
                name={`${accessibilityId}-${option.id}`}
                value={choice.value}
                checked={currentValue === choice.value}
                onChange={() => handleOptionChange(option.id, choice.value)}
                disabled={readOnly || !choice.available}
                aria-label={choice.label}
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderQuantityOption = (option: ProductOption) => {
    return (
      <div className="option-group" key={option.id}>
        <label className="option-label" htmlFor={`quantity-input`}>
          {option.name}
          {option.required && <span className="required">*</span>}
          {appliedDiscount > 0 && <span className="discount-badge">{appliedDiscount}% OFF</span>}
        </label>
        <div className="quantity-control">
          <button
            className="quantity-btn"
            onClick={() => handleQuantityChange(quantity - 1)}
            disabled={readOnly || quantity <= (option.min ?? 1)}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            id="quantity-input"
            type="number"
            className="quantity-input"
            value={quantity}
            onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
            min={option.min}
            max={option.max}
            disabled={readOnly}
          />
          <button
            className="quantity-btn"
            onClick={() => handleQuantityChange(quantity + 1)}
            disabled={readOnly || quantity >= (option.max ?? 999)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        {nextTier && (
          <p className="next-discount-hint">
            Add {nextTier.needed} more for {nextTier.discount}% discount!
          </p>
        )}
      </div>
    );
  };

  const renderToggleOption = (option: ProductOption) => {
    const currentValue = selections[option.id] as boolean;

    return (
      <div className="option-group" key={option.id}>
        <label className="toggle-control">
          <input
            type="checkbox"
            className={`toggle-switch ${currentValue ? 'active' : ''}`}
            checked={Boolean(currentValue)}
            onChange={(e) => handleOptionChange(option.id, e.target.checked)}
            disabled={readOnly}
          />
          <span className="toggle-label">{option.name}</span>
        </label>
      </div>
    );
  };

  const renderOption = (option: ProductOption) => {
    if (option.dependsOn) {
      const depValue = selections[option.dependsOn.optionId];
      if (depValue !== option.dependsOn.requiredValue) {
        return null;
      }
    }

    switch (option.type) {
      case 'select':
        return renderSelectOption(option);
      case 'color':
        return renderColorOption(option);
      case 'quantity':
        return renderQuantityOption(option);
      case 'toggle':
        return renderToggleOption(option);
      default:
        return null;
    }
  };

  const renderAddOn = (addOn: AddOn) => {
    const isSelected = selectedAddOns.includes(addOn.id);
    const isAvailable = isAddOnAvailable(addOn, selections);

    return (
      <label
        key={addOn.id}
        className={`addon-item ${isSelected ? 'selected' : ''} ${readOnly || !isAvailable ? 'disabled' : ''}`}
      >
        <input
          type="checkbox"
          className="addon-checkbox"
          checked={isSelected}
          onChange={() => handleAddOnToggle(addOn.id)}
          aria-label={addOn.name}
          aria-describedby={`${accessibilityId}-${addOn.id}-description`}
          disabled={readOnly || !isAvailable}
        />
        <span className="addon-info">
          <span className="addon-name">{addOn.name}</span>
          <span className="addon-description" id={`${accessibilityId}-${addOn.id}-description`}>
            {addOn.description}
            {!isAvailable && addOn.dependsOn && (
              <span style={{ color: '#e74c3c' }}> (Requires {addOn.dependsOn.optionId})</span>
            )}
          </span>
        </span>
        <span className="addon-price">+{formatPrice(addOn.price, product.currency)}</span>
      </label>
    );
  };

  const renderPriceBreakdown = () => {
    if (!price) return null;

    return (
      <div className="price-breakdown">
        <div className="price-line">
          <span>Base price</span>
          <span>{formatPrice(price.basePrice, product.currency)}</span>
        </div>

        {price.optionModifiers.map((mod, i) => {
          const option = product.options.find((o) => o.id === mod.optionId);
          return (
            <div className="price-line" key={i}>
              <span>{option?.name || mod.optionId}</span>
              <span>
                {mod.amount >= 0 ? '+' : ''}
                {formatPrice(mod.amount, product.currency)}
              </span>
            </div>
          );
        })}

        {price.addOnCosts.map((cost, i) => {
          const addOn = product.addOns.find((a) => a.id === cost.addOnId);
          return (
            <div className="price-line" key={i}>
              <span>{addOn?.name || cost.addOnId}</span>
              <span>+{formatPrice(cost.amount, product.currency)}</span>
            </div>
          );
        })}

        {quantity > 1 && (
          <div className="price-line">
            <span>Quantity ({quantity}×)</span>
            <span>{formatPrice(price.subtotal, product.currency)}</span>
          </div>
        )}

        {price.quantityDiscount > 0 && (
          <div className="price-line discount">
            <span>Volume discount ({appliedDiscount}%)</span>
            <span>-{formatPrice(price.quantityDiscount, product.currency)}</span>
          </div>
        )}

        <div className="price-line total">
          <span>Total</span>
          <span>{formatPrice(price.total, product.currency)}</span>
        </div>
      </div>
    );
  };

  const renderErrorMessage = () =>
    (error || priceError || validationError) && (
      <div className="error-message" role="alert">
        <div>Something went wrong. Please try again.</div>
        <div className="error-code">Error: {error || priceError || validationError}</div>
      </div>
    );

  const renderDraftModal = () => {
    if (!showDraftModal) return null;

    return (
      <dialog
        ref={modalRef}
        className="modal-overlay"
        aria-modal="true"
        onKeyDown={handleModalKeyDown}
        aria-labelledby={`${accessibilityId}-draft-title`}
        onClick={() => handleModalClose('draft')}
        onCancel={(e) => {
          e.preventDefault();
          handleModalClose('draft');
        }}
      >
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title" id={`${accessibilityId}-draft-title`}>
              Saved Drafts
            </h3>
            <button
              className="modal-close"
              onClick={() => handleModalClose('draft')}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            {renderErrorMessage()}
            {drafts.length === 0 ? (
              <p>No saved drafts yet.</p>
            ) : (
              <ul className="draft-list">
                {drafts.map((draft) => (
                  <li key={draft.id} className="draft-list-item">
                    <div>
                      <div className="draft-item-name">{draft.name}</div>
                      <div className="draft-item-date">Saved: {formatTimestamp(draft.savedAt)}</div>
                    </div>
                    <div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleLoadDraft(draft.id)}
                        style={{ marginRight: '8px' }}
                      >
                        Load
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDeleteDraft(draft.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid #eee',
              }}
            >
              <h4>Save Current Configuration</h4>
              <input
                type="text"
                placeholder="Draft name (optional)"
                aria-label="Draft name (optional)"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginBottom: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                }}
              />
              <button className="btn btn-primary btn-block" onClick={handleSaveDraft}>
                Save Draft
              </button>
            </div>
          </div>
        </div>
      </dialog>
    );
  };

  const renderShareModal = () => {
    if (!showShareModal) return null;

    return (
      <dialog
        ref={modalRef}
        className="modal-overlay"
        aria-modal="true"
        onKeyDown={handleModalKeyDown}
        aria-labelledby={`${accessibilityId}-share-title`}
        onClick={() => handleModalClose('share')}
        onCancel={(e) => {
          e.preventDefault();
          handleModalClose('share');
        }}
      >
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title" id={`${accessibilityId}-share-title`}>
              Share Configuration
            </h3>
            <button
              className="modal-close"
              onClick={() => handleModalClose('share')}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            {renderErrorMessage()}
            <p>Copy this link to share your configuration:</p>
            <input
              type="text"
              className="share-url-input"
              aria-label="Configuration share URL"
              value={shareUrl}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => handleModalClose('share')}>
              Close
            </button>
            <button className="btn btn-primary" onClick={handleCopyShareUrl}>
              Copy Link
            </button>
          </div>
        </div>
      </dialog>
    );
  };

  // -------------------------------------------------------------------------
  // Main Render
  // -------------------------------------------------------------------------

  return (
    <div className="configurator" ref={containerRef}>
      <div className="configurator-header">
        <div>
          <h1 className="configurator-title">{product.name}</h1>
          <p className="configurator-description">{product.description}</p>
        </div>
        <div className="configurator-actions">
          <button
            className="btn btn-secondary"
            onClick={(e) => {
              lastFocusedElement.current = e.currentTarget;
              setShowDraftModal(true);
            }}
          >
            Drafts
          </button>
          <button
            className="btn btn-secondary"
            onClick={(e) => {
              lastFocusedElement.current = e.currentTarget;
              setShowShareModal(true);
            }}
          >
            Share
          </button>
          {isDirty && (
            <button className="btn btn-danger" onClick={handleDiscardChanges}>
              Discard
            </button>
          )}
        </div>
      </div>

      {!showDraftModal && !showShareModal && renderErrorMessage()}

      {validation?.warnings.map((warning, i) => (
        <div key={i} className="validation-warning" role="status">
          {warning.message}
        </div>
      ))}

      <div className="configurator-layout">
        <div className="options-section">
          {product.options.filter((opt) => opt.type !== 'quantity').map(renderOption)}

          {product.options.filter((opt) => opt.type === 'quantity').map(renderOption)}

          {product.addOns.length > 0 && (
            <div className="addons-section">
              <h3 className="addons-title">Add-ons</h3>
              {product.addOns.map(renderAddOn)}
            </div>
          )}
        </div>

        <div className="preview-panel">
          <div className="preview-image-container">
            <img src={previewUrl} alt={`${product.name} preview`} className="preview-image" />
          </div>

          <div className={`price-display ${isPriceLoading ? 'price-loading' : ''}`}>
            <div className="price-label">Total Price</div>
            <div className="price-value">{formattedTotal}</div>
            <span className="visually-hidden" role="status" aria-atomic="true">
              {isPriceLoading ? 'Calculating price…' : `Total price: ${formattedTotal}`}
            </span>

            {renderPriceBreakdown()}

            <div className="validation-indicator" role="status" aria-atomic="true">
              {validation
                ? validation.valid
                  ? '✓ Configuration validated'
                  : `✗ Configuration invalid. ${validation.errors.map((issue) => issue.message).join(' ')}`
                : validationError
                  ? '✗ Validation failed'
                  : '⏳ Validating…'}
            </div>

            <div className="quick-add-section">
              <button className="quick-add-btn" onClick={handleAddToCart} disabled={!canAddToCart}>
                ⚡ Quick Add to Cart
              </button>
            </div>
          </div>

          <button
            className="btn btn-success btn-block"
            onClick={handleAddToCart}
            disabled={!canAddToCart}
          >
            {isPriceLoading ? 'Calculating...' : 'Add to Cart'}
          </button>

          <div className="config-summary">
            <div className="config-summary-title">Your Configuration</div>
            {product.options
              .filter((opt) => opt.type !== 'quantity' && selections[opt.id])
              .map((opt) => {
                const value = selections[opt.id];
                let displayValue: string = String(value);

                if (opt.choices) {
                  const choice = opt.choices.find((c) => c.value === value);
                  displayValue = choice?.label || String(value);
                }

                return (
                  <div key={opt.id} className="config-summary-item">
                    <span>{opt.name}:</span>
                    <span>{displayValue}</span>
                  </div>
                );
              })}
            <div className="config-summary-item">
              <span>Quantity:</span>
              <span>{quantity}</span>
            </div>
            {selectedAddOns.length > 0 && (
              <div className="config-summary-item">
                <span>Add-ons ({selectedAddOns.length}):</span>
                <span>
                  {selectedAddOns
                    .map((id) => {
                      const addOn = availableAddOns.get(id);
                      return addOn ? formatPrice(addOn.price, product.currency) : null;
                    })
                    .join(' + ')}
                </span>
              </div>
            )}
          </div>

          {lastSaved && (
            <div className="draft-section">
              <div className="draft-header">
                <span className="draft-title">Draft saved</span>
                <span className="draft-saved">Last saved: {lastSaved.toLocaleTimeString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {renderDraftModal()}
      {renderShareModal()}
    </div>
  );
};

export default ProductConfigurator;
