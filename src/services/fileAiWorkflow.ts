import type { FileTranscriptionRecord } from '../types';

interface Selection { prompt: string; name: string; model: string }
interface Dependencies {
  process: (text: string, prompt: string) => Promise<{ success: boolean; text: string; error: string | null }>;
  save: (record: FileTranscriptionRecord) => Promise<void>;
}

/** Always process the saved original; failed attempts preserve the last successful result. */
export async function processFileRecord(
  record: FileTranscriptionRecord, selection: Selection, dependencies: Dependencies,
): Promise<FileTranscriptionRecord> {
  let updated: FileTranscriptionRecord;
  try {
    const response = await dependencies.process(record.transcriptText, selection.prompt);
    if (!response.success || !response.text.trim()) {
      throw new Error(response.error || 'EMPTY_AI_RESPONSE');
    }
    updated = { ...record, processedText: response.text, aiStatus: 'completed', aiError: undefined,
      aiModelId: selection.model, aiPromptName: selection.name };
  } catch (error) {
    updated = { ...record, aiStatus: 'error', aiError: error instanceof Error ? error.message : String(error) };
  }
  // Keep persistence errors distinct from processing failures.
  await dependencies.save(updated);
  return updated;
}
