// TypeScript typed keys for i18next — enables compile-time type checking of t() calls.
// CustomTypeOptions augments the i18next module with our resource structure.
// Typed keys are validated by `tsc --build` via the resources['en'] type.

import { resources } from './index'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'shell'
    resources: (typeof resources)['en']
  }
}
