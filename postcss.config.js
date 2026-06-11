// PostCSS config (CommonJS — package.json has no "type":"module").
// Required so electron-vite's renderer build runs Tailwind v3 + Autoprefixer.
// Without this, the @tailwind directives in globals.css are never processed and
// no utility classes are generated (the v4-installed-but-v3-configured bug).
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
