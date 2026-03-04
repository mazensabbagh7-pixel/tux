import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";

import type { SectionRule } from "@/common/schemas/project";
import { installDom } from "../../../../tests/ui/dom";

import { SectionRuleEditor } from "./SectionRuleEditor";

let cleanupDom: (() => void) | null = null;

const noop = (): void => undefined;

describe("SectionRuleEditor", () => {
  beforeEach(() => {
    cleanupDom = installDom();
  });

  afterEach(() => {
    cleanup();
    cleanupDom?.();
    cleanupDom = null;
  });

  test("renders empty state when no rules exist", () => {
    const view = render(<SectionRuleEditor rules={[]} onSave={noop} onClose={noop} />);

    expect(view.getByTestId("add-rule-button")).toBeTruthy();
    expect(view.queryAllByTestId("condition-row").length).toBe(0);
    expect(view.getByText("No rules yet. Add a rule or start from a preset.")).toBeTruthy();
  });

  test("displays existing rule conditions", () => {
    const rules: SectionRule[] = [
      {
        conditions: [
          { field: "agentMode", op: "eq", value: "plan" },
          { field: "streaming", op: "eq", value: true },
        ],
      },
    ];

    const view = render(<SectionRuleEditor rules={rules} onSave={noop} onClose={noop} />);

    expect(view.getAllByTestId("condition-row").length).toBe(2);
    expect((view.getAllByLabelText("Field")[0] as HTMLSelectElement).value).toBe("agentMode");
    expect((view.getAllByLabelText("Value")[1] as HTMLSelectElement).value).toBe("true");
  });

  test("adds a rule from preset", () => {
    const view = render(<SectionRuleEditor rules={[]} onSave={noop} onClose={noop} />);

    fireEvent.change(view.getByTestId("rule-preset-select"), {
      target: { value: "1" },
    });

    expect(view.getAllByTestId("condition-row").length).toBe(1);
    expect((view.getByLabelText("Field") as HTMLSelectElement).value).toBe("prState");
    expect((view.getByLabelText("Operator") as HTMLSelectElement).value).toBe("eq");
    expect((view.getByLabelText("Value") as HTMLSelectElement).value).toBe("OPEN");
  });

  test("removing the last condition removes the entire rule", () => {
    const rules: SectionRule[] = [
      {
        conditions: [{ field: "streaming", op: "eq", value: true }],
      },
    ];

    const view = render(<SectionRuleEditor rules={rules} onSave={noop} onClose={noop} />);

    fireEvent.click(view.getByTestId("remove-condition-button"));

    expect(view.queryAllByTestId("condition-row").length).toBe(0);
    expect(view.getByText("No rules yet. Add a rule or start from a preset.")).toBeTruthy();
  });

  test("save calls onSave with the edited rules", () => {
    const onSave = mock((_: SectionRule[]) => undefined);
    const view = render(<SectionRuleEditor rules={[]} onSave={onSave} onClose={noop} />);

    fireEvent.change(view.getByTestId("rule-preset-select"), {
      target: { value: "1" },
    });
    fireEvent.click(view.getByTestId("save-rules-button"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [savedRules] = onSave.mock.calls[0] as [SectionRule[]];
    expect(savedRules).toEqual([
      {
        conditions: [{ field: "prState", op: "eq", value: "OPEN" }],
      },
    ]);
  });
});
