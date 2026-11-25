interface LiveVoicePasteResult {
  success: boolean;
  error?: string;
}

export class LiveVoiceInput {
  readonly id: number;
  private readonly paste: (text: string) => Promise<LiveVoicePasteResult>;
  private latest = '';
  private sent = '';
  private sending?: Promise<void>;
  private cancelled = false;
  private finished = false;
  private blocked = false;
  private recognitionIncomplete = false;

  constructor(
    id: number,
    paste: (text: string) => Promise<LiveVoicePasteResult>,
  ) {
    this.id = id;
    this.paste = paste;
  }

  get transcript() { return this.latest; }
  get interrupted() { return this.blocked || this.recognitionIncomplete; }

  markRecognitionIncomplete() {
    this.recognitionIncomplete = true;
  }

  update(text: string) {
    if (this.cancelled || this.finished || !text.startsWith(this.latest)) return;
    this.latest = text;
    this.sendPending();
  }

  async finish(text: string) {
    this.finished = true;
    if (this.cancelled) return;
    // A finalized transcript remains available for history even if earlier text
    // was revised. The existing text in the target editor must stay intact.
    if (!text.startsWith(this.latest)) this.blocked = true;
    this.latest = text;
    for (let pending = this.sendPending(); pending; pending = this.sendPending()) {
      await pending;
    }
  }

  cancel() {
    this.cancelled = true;
  }

  private sendPending() {
    if (!this.sending && !this.cancelled && !this.blocked && this.latest !== this.sent) {
      this.sending = this.drain().finally(() => {
        this.sending = undefined;
        if (!this.finished) this.sendPending();
      });
    }
    return this.sending;
  }

  private async drain() {
    while (!this.cancelled && !this.blocked && this.latest !== this.sent) {
      const snapshot = this.latest;
      try {
        const result = await this.paste(snapshot.slice(this.sent.length));
        if (!result.success) {
          this.blocked = true;
          return;
        }
        this.sent = snapshot;
      } catch {
        this.blocked = true;
      }
    }
  }
}
