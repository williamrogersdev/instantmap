export const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export const formatMs = (ms: number): string => `${Math.round(ms).toLocaleString("en-US")} ms`;

let toastTimer = 0;
export function toast(text: string): void {
  let element = document.querySelector<HTMLDivElement>(".toast");
  if (!element) {
    element = document.createElement("div");
    element.className = "toast";
    element.setAttribute("role", "status");
    document.body.append(element);
  }
  element.textContent = text;
  element.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove("on"), 1800);
}

/** Any button with data-copy="text" or data-copy-target="element id" copies on click. */
export function setupCopyButtons(): void {
  document.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy], [data-copy-target]");
    if (!button) return;
    const target = button.dataset.copyTarget;
    const text = target ? (byId(target).textContent ?? "") : (button.dataset.copy ?? "");
    try {
      await navigator.clipboard.writeText(text);
      toast(text.startsWith("npm") ? "Copied install command" : text.startsWith("Add an Instant Map") ? "Copied prompt" : "Copied code");
    } catch {
      toast("Select the text and copy it with your keyboard");
    }
  });
}

/** Tabs: buttons with role="tab" and data-tab inside `root`. Calls back with the chosen tab. */
export function setupTabs(root: ParentNode, onChange: (tab: string) => void): void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  for (const button of tabs) {
    button.addEventListener("click", () => {
      for (const other of tabs) other.setAttribute("aria-selected", String(other === button));
      onChange(button.dataset.tab!);
    });
  }
}
