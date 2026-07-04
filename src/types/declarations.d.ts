// Ambient declarations for file types that TypeScript doesn't handle natively.
// These cover the Expo default template files; our own code avoids CSS imports.

declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}

// Side-effect CSS imports (used by template files; not used in src/domain or src/db)
declare module '*.css' {}
