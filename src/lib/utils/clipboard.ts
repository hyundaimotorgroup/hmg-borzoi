export async function writeTextSafe(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const clipboardSuccess = await tryClipboard(text);
  if (clipboardSuccess) return true;

  return legacyCopy(text);
}

async function tryClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard || !window.isSecureContext) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    return false;
  }
}

function legacyCopy(text: string): boolean {
  try {
    // Radix Dialog (and other focus-trapping modals) yank focus back inside
    // their content boundary the instant an element outside it is focused.
    // Appending the scratch textarea to document.body puts it outside that
    // boundary, so textarea.select()'s implicit focus() gets immediately
    // reverted and execCommand("copy") runs against the wrong selection.
    // Mounting it inside the open dialog's content (if any) keeps it within
    // the trap so the selection sticks.
    const dialogContents = document.querySelectorAll('[data-slot="dialog-content"]');
    const container = (dialogContents[dialogContents.length - 1] as HTMLElement | undefined) ?? document.body;

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    container.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const success = document.execCommand("copy");
    container.removeChild(textarea);
    return success;
  } catch (_error) {
    return false;
  }
}
