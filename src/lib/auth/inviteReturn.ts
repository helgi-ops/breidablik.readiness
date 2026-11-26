/**
 * After sign-in, someone who came from an invitation link goes back to that
 * invitation page — whatever their role — so the invitation is accepted there.
 * (Before: /auth/redirect sent them to their home page and the invite was lost.)
 *
 * Only our own invite pages qualify: a same-site path, no protocol-relative or
 * absolute URL, so `next` can't be used to send people elsewhere.
 */
const INVITE_PATH = /^\/invite\/(client|coach)\/[A-Za-z0-9_-]+\/?$/;

export function inviteReturnPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const path = next.split(/[?#]/)[0];
  return INVITE_PATH.test(path) ? path : null;
}
