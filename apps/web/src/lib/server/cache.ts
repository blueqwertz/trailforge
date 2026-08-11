/**
 * Zwischenspeicher und Zugriffsbremse für den Routing-Proxy.
 *
 * brouter.de wird ehrenamtlich betrieben, und eine einzige Anfrage der
 * Oberfläche löst bis zu vier Anfragen dorthin aus. Beides — Cache und
 * Begrenzung — ist deshalb keine Feinheit, sondern Voraussetzung für einen
 * anständigen Umgang mit dem Dienst.
 *
 * Beides hält den Zustand im Arbeitsspeicher und gilt damit je Serverinstanz.
 * Für den Betrieb auf mehreren Instanzen gehört hier ein gemeinsamer Speicher
 * hin; für den jetzigen Umfang wäre das verfrüht.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries = 500,
    private readonly ttlMs = 60 * 60 * 1000,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Erneut einfügen, damit die Einfügereihenfolge der Nutzung entspricht
    // und beim Verdrängen der am längsten ungenutzte Eintrag fällt.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

/** Einfacher Zähler je Fenster und Absender. */
export class RateLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit = 30,
    private readonly windowMs = 60 * 1000,
  ) {}

  /** Gibt zurück, ob die Anfrage erlaubt ist, und wie lange bis zum nächsten Fenster. */
  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const counter = this.counters.get(key);

    if (!counter || counter.resetAt < now) {
      this.counters.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    counter.count++;
    if (counter.count > this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((counter.resetAt - now) / 1000)),
      };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}
