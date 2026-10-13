const path = require('node:path');

globalThis.__dirname = path.resolve(process.cwd(), 'apps/api/src');
