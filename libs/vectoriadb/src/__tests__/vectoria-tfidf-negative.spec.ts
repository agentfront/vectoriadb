import { TFIDFVectoria } from '../vectoria-tfidf';

/**
 * Negative / anti-query ranking on the worker-safe TF-IDF path:
 * `score = sim(doc, query) − negativeWeight · maxᵢ sim(doc, negativeᵢ)`.
 * This is what powers "find skills for X but NOT Y" (e.g. add a policy, but not
 * the enforcement ones).
 */
describe('TFIDFVectoria — negative/anti-query ranking', () => {
  function db(): TFIDFVectoria {
    const v = new TFIDFVectoria({ defaultSimilarityThreshold: 0 });
    v.addDocument('add-policy', 'Add and create a new policy. Register policy definitions in the system.', {});
    v.addDocument(
      'enforce-policy',
      'Enforcement policy that enforces and blocks access. Reject and deny unauthorized requests.',
      {},
    );
    v.addDocument('user-profile', 'Manage the user profile. Update display name, avatar and email address.', {});
    return v;
  }

  it('returns both policy skills for the positive query alone', () => {
    const results = db().search('policy', { threshold: 0 });
    const ids = results.map((r) => r.id);
    expect(ids).toContain('add-policy');
    expect(ids).toContain('enforce-policy');
  });

  it('demotes the enforcement skill when "enforcement" is a negative query', () => {
    const v = db();
    const plain = v.search('policy', { threshold: 0 });
    const filtered = v.search('policy', { negativeQuery: 'enforcement enforce block access', threshold: 0 });

    const enforcePlain = plain.find((r) => r.id === 'enforce-policy')!;
    const enforceFiltered = filtered.find((r) => r.id === 'enforce-policy');

    // The non-enforcement policy now ranks first…
    expect(filtered[0].id).toBe('add-policy');
    // …and the enforcement skill is penalized (lower score, or dropped entirely).
    if (enforceFiltered) {
      expect(enforceFiltered.score).toBeLessThan(enforcePlain.score);
      expect(enforceFiltered.score).toBeLessThan(filtered[0].score);
    }
  });

  it('drops anti-query-dominated results below a positive threshold', () => {
    const v = db();
    const filtered = v.search('policy', { negativeQuery: 'enforcement enforce block access', threshold: 0.05 });
    // With a positive threshold, a skill more similar to the anti-query than the
    // query falls out entirely.
    expect(filtered.map((r) => r.id)).not.toContain('enforce-policy');
    expect(filtered.map((r) => r.id)).toContain('add-policy');
  });

  it('accepts multiple negative queries (array)', () => {
    const v = db();
    const filtered = v.search('policy', { negativeQuery: ['enforcement', 'block access'], threshold: 0 });
    expect(filtered[0].id).toBe('add-policy');
  });

  it('negativeWeight: 0 disables the penalty (equivalent to no negative)', () => {
    const v = db();
    const plain = v.search('policy', { threshold: 0 });
    const weighted = v.search('policy', { negativeQuery: 'enforcement', negativeWeight: 0, threshold: 0 });
    expect(weighted.map((r) => r.id)).toEqual(plain.map((r) => r.id));
  });
});
