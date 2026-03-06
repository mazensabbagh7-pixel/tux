import { useEffect, useRef, useState } from "react";
import { Plus, X, Zap } from "lucide-react";

import assert from "@/common/utils/assert";
import { stopKeyboardPropagation } from "@/browser/utils/events";
import { RULE_FIELD_KEYS, RULE_FIELD_META } from "@/common/constants/sectionRuleFields";
import type { SectionRule, SectionRuleCondition } from "@/common/schemas/project";

const STRING_OPERATOR_OPTIONS: Array<{ label: string; value: SectionRuleCondition["op"] }> = [
  { label: "equals", value: "eq" },
  { label: "not equals", value: "neq" },
  { label: "in", value: "in" },
];

const BOOLEAN_OPERATOR_OPTIONS: Array<{ label: string; value: SectionRuleCondition["op"] }> = [
  { label: "equals", value: "eq" },
  { label: "not equals", value: "neq" },
];

const RULE_PRESETS = [
  {
    label: "Planning workspaces",
    rule: {
      conditions: [{ field: "agentMode", op: "eq", value: "plan" }],
    },
  },
  {
    label: "Open PRs",
    rule: {
      conditions: [{ field: "prState", op: "eq", value: "OPEN" }],
    },
  },
  {
    label: "Merge-ready",
    rule: {
      conditions: [
        { field: "prState", op: "eq", value: "OPEN" },
        { field: "prIsDraft", op: "eq", value: false },
        { field: "prMergeStatus", op: "eq", value: "CLEAN" },
        { field: "prHasFailedChecks", op: "eq", value: false },
        { field: "prHasPendingChecks", op: "eq", value: false },
      ],
    },
  },
  {
    label: "Actively streaming",
    rule: {
      conditions: [{ field: "streaming", op: "eq", value: true }],
    },
  },
  {
    label: "Failed CI",
    rule: {
      conditions: [{ field: "prHasFailedChecks", op: "eq", value: true }],
    },
  },
] satisfies Array<{ label: string; rule: SectionRule }>;

const selectClasses =
  "bg-background/70 border-border text-foreground min-w-0 rounded border px-1 py-0.5 text-[11px] outline-none";

interface SectionRuleEditorProps {
  rules: SectionRule[];
  onSave: (rules: SectionRule[]) => void;
  onClose: () => void;
}

function cloneRules(rules: SectionRule[]): SectionRule[] {
  return rules.map((rule) => ({
    conditions: rule.conditions.map((condition) => ({ ...condition })),
  }));
}

function getDefaultField(): SectionRuleCondition["field"] {
  const defaultField = RULE_FIELD_KEYS[0];
  assert(defaultField != null, "Section rule fields must include at least one field");
  return defaultField;
}

function getFieldOptions(field: SectionRuleCondition["field"]): Array<{
  label: string;
  value: string | boolean;
}> {
  const options = RULE_FIELD_META[field].options;
  assert(
    Array.isArray(options) && options.length > 0,
    `Section rule field ${field} must define at least one selectable option`
  );
  return options;
}

function isRulePrimitive(value: unknown): value is string | boolean {
  return typeof value === "string" || typeof value === "boolean";
}

function parseInValue(value: string): string | boolean | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return undefined;
    }

    const firstValue = parsed[0] as unknown;
    if (isRulePrimitive(firstValue)) {
      return firstValue;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function coerceFieldValue(
  field: SectionRuleCondition["field"],
  value: string | boolean
): string | boolean {
  const options = getFieldOptions(field);
  const exact = options.find((option) => option.value === value);
  if (exact) {
    return exact.value;
  }

  const byString = options.find((option) => String(option.value) === String(value));
  if (byString) {
    return byString.value;
  }

  // Preserve unknown values instead of coercing to the first option.
  // A future version may introduce new field values that this editor does not recognize yet.
  return value;
}

function getConditionPrimitiveValue(condition: SectionRuleCondition): string | boolean {
  if (condition.op === "in" && typeof condition.value === "string") {
    const parsed = parseInValue(condition.value);
    if (parsed != null) {
      return coerceFieldValue(condition.field, parsed);
    }
  }

  return coerceFieldValue(condition.field, condition.value);
}

function getValueForOperator(
  field: SectionRuleCondition["field"],
  op: SectionRuleCondition["op"],
  value: string | boolean
): string | boolean {
  const normalized = coerceFieldValue(field, value);
  if (op === "in") {
    return JSON.stringify([normalized]);
  }
  return normalized;
}

function createDefaultCondition(
  field: SectionRuleCondition["field"] = getDefaultField(),
  op: SectionRuleCondition["op"] = "eq"
): SectionRuleCondition {
  const defaultValue = getFieldOptions(field)[0].value;
  return {
    field,
    op,
    value: getValueForOperator(field, op, defaultValue),
  };
}

function getConditionSelectValue(condition: SectionRuleCondition): string {
  const primitiveValue = getConditionPrimitiveValue(condition);
  return String(primitiveValue);
}

function ConditionRow(props: {
  condition: SectionRuleCondition;
  onChange: (nextCondition: SectionRuleCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const fieldMeta = RULE_FIELD_META[props.condition.field];
  const valueOptions = getFieldOptions(props.condition.field);
  const operatorOptions =
    fieldMeta.type === "boolean" ? BOOLEAN_OPERATOR_OPTIONS : STRING_OPERATOR_OPTIONS;
  const selectValue = getConditionSelectValue(props.condition);
  const hasKnownValue = valueOptions.some((option) => String(option.value) === selectValue);

  return (
    <div className="flex items-center gap-1.5" data-testid="condition-row">
      <select
        aria-label="Field"
        className={`${selectClasses} w-[9.25rem]`}
        value={props.condition.field}
        onChange={(event) => {
          const nextField = event.target.value as SectionRuleCondition["field"];
          const nextFieldMeta = RULE_FIELD_META[nextField];
          const nextOp =
            nextFieldMeta.type === "boolean" && props.condition.op === "in"
              ? "eq"
              : props.condition.op;
          props.onChange(createDefaultCondition(nextField, nextOp));
        }}
      >
        {RULE_FIELD_KEYS.map((field) => (
          <option key={field} value={field}>
            {RULE_FIELD_META[field].label}
          </option>
        ))}
      </select>

      <select
        aria-label="Operator"
        className={`${selectClasses} w-[5.5rem]`}
        value={props.condition.op}
        onChange={(event) => {
          const nextOp = event.target.value as SectionRuleCondition["op"];
          const nextValue = getValueForOperator(
            props.condition.field,
            nextOp,
            getConditionPrimitiveValue(props.condition)
          );
          props.onChange({
            ...props.condition,
            op: nextOp,
            value: nextValue,
          });
        }}
      >
        {operatorOptions.map((operator) => (
          <option key={operator.value} value={operator.value}>
            {operator.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Value"
        className={`${selectClasses} flex-1`}
        value={selectValue}
        onChange={(event) => {
          const selectedOption = valueOptions.find(
            (option) => String(option.value) === event.target.value
          );
          assert(
            selectedOption != null,
            "Selected condition value must exist in available options"
          );
          props.onChange({
            ...props.condition,
            value: getValueForOperator(
              props.condition.field,
              props.condition.op,
              selectedOption.value
            ),
          });
        }}
      >
        {!hasKnownValue && <option value={selectValue}>{selectValue}</option>}
        {valueOptions.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>

      {props.canRemove && (
        <button
          type="button"
          onClick={props.onRemove}
          className="text-muted hover:text-danger-light hover:bg-danger-light/10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 transition-colors"
          aria-label="Remove condition"
          data-testid="remove-condition-button"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function SectionRuleEditor({ rules, onSave, onClose }: SectionRuleEditorProps) {
  const [draftRules, setDraftRules] = useState<SectionRule[]>(() => cloneRules(rules));
  const [presetSelection, setPresetSelection] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      stopKeyboardPropagation(event);
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const addRule = (rule?: SectionRule) => {
    const nextRule =
      rule != null
        ? { conditions: rule.conditions.map((condition) => ({ ...condition })) }
        : { conditions: [createDefaultCondition()] };

    setDraftRules((previousRules) => [...previousRules, nextRule]);
  };

  return (
    <div
      ref={containerRef}
      className="bg-background border-border absolute top-full right-0 z-50 mt-1 w-[25rem] rounded border p-2 shadow-lg"
      data-testid="section-rule-editor"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-foreground flex items-center gap-1.5 text-xs font-medium">
          <Zap size={12} />
          <span>Auto-assign rules</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-foreground hover:bg-hover flex h-5 w-5 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 transition-colors"
          aria-label="Close auto-assign rules editor"
        >
          <X size={12} />
        </button>
      </div>

      {draftRules.length === 0 ? (
        <div className="text-muted rounded border border-dashed border-white/10 px-2 py-2 text-[11px]">
          No rules yet. Add a rule or start from a preset.
        </div>
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto pb-0.5">
          {draftRules.map((rule, ruleIndex) => (
            <div key={`rule-${ruleIndex}`}>
              {ruleIndex > 0 && (
                <div className="text-muted mb-1 text-center text-[10px] font-medium tracking-wide uppercase">
                  OR
                </div>
              )}
              <div className="bg-background/40 rounded border border-white/10 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-muted text-[10px] font-medium tracking-wide uppercase">
                    Rule {ruleIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftRules((previousRules) =>
                        previousRules.filter((_, index) => index !== ruleIndex)
                      );
                    }}
                    className="text-muted hover:text-danger-light hover:bg-danger-light/10 cursor-pointer rounded border-none bg-transparent px-1 py-0.5 text-[10px] transition-colors"
                    aria-label="Remove rule"
                    data-testid="remove-rule-button"
                  >
                    Remove rule
                  </button>
                </div>

                <div className="space-y-1.5">
                  {rule.conditions.map((condition, conditionIndex) => (
                    <div key={`rule-${ruleIndex}-condition-${conditionIndex}`}>
                      {conditionIndex > 0 && (
                        <div className="text-muted mb-1 text-[10px] font-medium tracking-wide uppercase">
                          AND
                        </div>
                      )}
                      <ConditionRow
                        condition={condition}
                        onChange={(nextCondition) => {
                          setDraftRules((previousRules) =>
                            previousRules.map((previousRule, index) => {
                              if (index !== ruleIndex) {
                                return previousRule;
                              }

                              return {
                                ...previousRule,
                                conditions: previousRule.conditions.map((previousCondition, idx) =>
                                  idx === conditionIndex ? nextCondition : previousCondition
                                ),
                              };
                            })
                          );
                        }}
                        onRemove={() => {
                          setDraftRules((previousRules) =>
                            previousRules.flatMap((previousRule, index) => {
                              if (index !== ruleIndex) {
                                return [previousRule];
                              }

                              const nextConditions = previousRule.conditions.filter(
                                (_, idx) => idx !== conditionIndex
                              );

                              if (nextConditions.length === 0) {
                                return [];
                              }

                              return [{ ...previousRule, conditions: nextConditions }];
                            })
                          );
                        }}
                        canRemove
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDraftRules((previousRules) =>
                      previousRules.map((previousRule, index) => {
                        if (index !== ruleIndex) {
                          return previousRule;
                        }

                        return {
                          ...previousRule,
                          conditions: [...previousRule.conditions, createDefaultCondition()],
                        };
                      })
                    );
                  }}
                  className="text-muted hover:text-foreground hover:bg-hover mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded border-none bg-transparent px-1 py-0.5 text-[10px] transition-colors"
                  aria-label="Add condition"
                  data-testid="add-condition-button"
                >
                  <Plus size={10} />
                  Add condition
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => addRule()}
          className="text-muted hover:text-foreground hover:bg-hover inline-flex cursor-pointer items-center gap-1 rounded border-none bg-transparent px-1.5 py-1 text-[11px] transition-colors"
          data-testid="add-rule-button"
        >
          <Plus size={12} />
          Add rule
        </button>

        <select
          aria-label="Add rule from preset"
          className={`${selectClasses} ml-auto min-w-[9rem]`}
          value={presetSelection}
          onChange={(event) => {
            const nextValue = event.target.value;
            setPresetSelection("");
            if (!nextValue) {
              return;
            }

            const presetIndex = Number.parseInt(nextValue, 10);
            const preset = RULE_PRESETS[presetIndex];
            assert(preset != null, "Selected preset index must map to a known section rule preset");
            addRule(preset.rule);
          }}
          data-testid="rule-preset-select"
        >
          <option value="">Preset…</option>
          {RULE_PRESETS.map((preset, index) => (
            <option key={preset.label} value={String(index)}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
        <button
          type="button"
          onClick={() => onSave([])}
          className="text-muted hover:text-foreground hover:bg-hover cursor-pointer rounded border-none bg-transparent px-1.5 py-1 text-[11px] transition-colors"
          disabled={draftRules.length === 0}
          data-testid="clear-rules-button"
        >
          Clear all
        </button>

        <button
          type="button"
          onClick={() => {
            assert(
              draftRules.every((rule) => rule.conditions.length > 0),
              "Section rules must each include at least one condition"
            );
            onSave(cloneRules(draftRules));
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded border-none px-2 py-1 text-[11px] font-medium transition-colors"
          data-testid="save-rules-button"
        >
          Save rules
        </button>
      </div>
    </div>
  );
}
