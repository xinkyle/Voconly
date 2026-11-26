export type InputStatus = 'confirmed' | 'submitted' | 'not_submitted' | 'uncertain';

export interface InputOutcome {
  status: InputStatus;
  method: string;
  reason?: string | null;
  clipboardAvailable: boolean;
}

/** Once delivery starts, an error cannot prove that the target received nothing. */
export async function deliverTextOnce(
  text: string,
  send: (text: string) => Promise<InputOutcome>,
): Promise<InputOutcome> {
  try {
    return await send(text);
  } catch (error) {
    const reason = String(error);
    return {
      status: reason.includes('ACCESSIBILITY_DENIED') ? 'not_submitted' : 'uncertain',
      method: 'keyboard',
      reason,
      clipboardAvailable: reason.includes('ACCESSIBILITY_DENIED'),
    };
  }
}
