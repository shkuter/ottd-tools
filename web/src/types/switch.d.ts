import 'react';

/**
 * The `switch` attribute of <input type="checkbox"> — native in Safari 17.4+,
 * polyfilled elsewhere (see main.tsx). React only forwards attributes it knows
 * or string-valued unknown ones, so it is passed as switch="".
 */
declare module 'react' {
  interface InputHTMLAttributes<T> {
    switch?: '';
  }
}
