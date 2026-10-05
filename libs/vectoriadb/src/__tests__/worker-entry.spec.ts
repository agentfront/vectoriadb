/**
 * The worker/browser entry must load without Node built-ins: a browser bundle cannot resolve them,
 * and a V8 isolate without Node compatibility has none.
 */

const NODE_BUILT_INS = ['crypto', 'fs', 'fs/promises', 'path', 'os', 'child_process', 'net', 'stream'];

describe('the worker entry', () => {
  it('loads without requiring a Node built-in', () => {
    jest.isolateModules(() => {
      for (const builtIn of NODE_BUILT_INS) {
        jest.doMock(builtIn, () => {
          throw new Error(`the worker entry required the Node built-in "${builtIn}"`);
        });
      }

      expect(() => require('../worker')).not.toThrow();
    });
  });

  it('builds and searches a TF-IDF index', () => {
    jest.isolateModules(() => {
      const { TFIDFVectoria } = require('../worker');
      const db = new TFIDFVectoria({ defaultTopK: 2 });
      db.addDocument('deploy', 'deploy the server to cloudflare workers', { id: 'deploy' });
      db.addDocument('test', 'write unit tests with jest', { id: 'test' });
      db.reindex();

      expect(db.search('cloudflare deploy')[0]?.id).toBe('deploy');
    });
  });
});
