import { createCatalog, normalizeToken, safeError } from './catalog.mjs';

/** Native credential hosts require a boolean; a truthy error object permits Save. */
export async function checkCredential({ token, credentialId, proxy, commit, onError = () => { /* Feedback is optional for non-visual callers. */ }, isCurrent = () => true, options = {} }) {
  try {
    const draft = normalizeToken(token);

    if (!draft && !credentialId) {
      onError('required');

      return false;
    }
    const auth = draft ? { token: draft } : { id: credentialId };

    await createCatalog(proxy, auth, { ...options, isCurrent }).probe();
    if (!isCurrent()) {
      return false;
    }
    if (draft) {
      commit(draft);
    }

    return true;
  } catch (error) {
    if (isCurrent()) {
      onError(safeError(error).code);
    }

    return false;
  }
}
