import { build } from 'esbuild';
await build({
  entryPoints: ['ui/app.jsx'],
  bundle: true,
  outfile: 'static/main.js',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  minify: true,
  logLevel: 'info',
});
console.log('built static/main.js');
