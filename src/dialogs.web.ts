import type { DialogButton } from './dialogs';

export type { DialogButton };

// Browsers have no multi-button alert, so each choice (other than Cancel) is offered in
// turn with confirm(): OK picks it, Cancel moves on to the next. Cancelling them all
// does nothing, like tapping Cancel.
export function showDialog(title: string, message: string, buttons: DialogButton[]) {
  const choices = buttons.filter((b) => b.style !== 'cancel');
  for (const choice of choices) {
    const prompt =
      choices.length === 1 ? `${title}\n\n${message}` : `${title}\n\n${message}\n\n${choice.text}?`;
    if (window.confirm(prompt)) {
      choice.onPress?.();
      return;
    }
  }
}
