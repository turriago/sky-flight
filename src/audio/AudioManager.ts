export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private started = false;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) {
      return;
    }

    this.context = new Context();
    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.master = this.context.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.context.destination);

    const buffer = this.createNoiseBuffer(this.context);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;

    this.wind = this.context.createGain();
    this.wind.gain.value = 0.18;

    source.connect(filter);
    filter.connect(this.wind);
    this.wind.connect(this.master);
    source.start();
    this.started = true;
  }

  setFlightLevel(speedKmh: number, altitude: number): void {
    if (!this.context || !this.wind) {
      return;
    }

    const speedNorm = Math.min(1, Math.max(0, (speedKmh - 20) / 140));
    const altitudeNorm = Math.min(1, Math.max(0, altitude / 120));
    const target = 0.12 + speedNorm * 0.38 + altitudeNorm * 0.08;
    const now = this.context.currentTime;
    this.wind.gain.setTargetAtTime(target, now, 0.2);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.wind = null;
    this.started = false;
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
