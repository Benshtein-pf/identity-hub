/** Injectable clock so services with time-based logic (session expiry, API key expiry) are deterministically testable. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
