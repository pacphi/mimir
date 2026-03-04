/**
 * Minimal type declarations for @maxmind/geoip2-node (optional dependency).
 */
declare module "@maxmind/geoip2-node" {
  export class Reader {
    static open(path: string): Promise<Reader>;
    city(ip: string): {
      city?: { names?: { en?: string } };
      country?: { names?: { en?: string } };
      location?: { latitude?: number; longitude?: number };
    };
  }

  export class WebServiceClient {
    constructor(accountId: string, licenseKey: string, options?: { host?: string });
    city(ip: string): {
      city?: { names?: { en?: string } };
      country?: { names?: { en?: string } };
      location?: { latitude?: number; longitude?: number };
    };
  }
}
