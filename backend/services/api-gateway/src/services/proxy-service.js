/**
 * Forwards a call to an internal service and returns its raw status and body.
 * Deliberately has no business logic: it only chooses the upstream client.
 */
export class ProxyService {
  constructor(upstreams) {
    this.upstreams = upstreams;
  }

  /** Sends the request upstream (service token, x-request-id, timeout, retry and breaker apply). */
  forward(upstream, method, path, options) {
    return this.upstreams[upstream].request(method, path, options);
  }
}
