export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="warning" role="alert">
      <span className="warning-icon" aria-hidden="true">
        ⚠
      </span>
      <div>{children}</div>
    </div>
  );
}
